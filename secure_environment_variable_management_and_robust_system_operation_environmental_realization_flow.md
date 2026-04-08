# セキュアな環境変数管理と堅牢なシステム動作環境の実現フロー

## 1. 環境変数のセキュアな受け渡しのベストプラクティス

### 【実務環境】（AWSマネージドサービス推奨）

本番稼働するサーバーのディスク上に`.env`ファイルを平文で配置することは、情報漏洩のリスクを伴うため非推奨です。

- **クラウドサービスの活用:** AWS Secrets Manager や SSM Parameter Store などでシークレットを一元管理します。
- **動的取得:** アプリケーションの起動時や必要なタイミングに、API（AWS SDK）経由で上記サービスからシークレットを直接メモリ上に取得します。
- **IAMロールの徹底:** EC2インスタンスには、自分が必要なシークレットのみを読み取れる「最小権限」のIAMロールをアタッチします。AWSアクセスキーなどはシステム内に持たせません。
- ※**ローカル開発環境:** `.gitignore`でGitの管理から除外した上で`.env`を使用する運用で問題ありません。

### 【AWS Academy環境】（IAM制限下）

IAMユーザーやロールの作成・編集が制限されているため、実務環境のベストプラクティス（IAMロールによるアクセス制御）が安全に適用できません。

- **代替アプローチ:** AWSサービスへの依存を減らし、**「CI/CDツール（GitHub Actions） + systemd」** の組み合わせによってOSの機能でセキュアな構成を実現します。
- **シークレットの源泉:** AWS Secrets Managerの代わりに、GitHub Actions Secretsを実質的なシークレットのマスターとして扱います。

---

## 2. アプリケーション実行ユーザーとは

Webアプリケーションのプロセスを起動・実行するためだけにOS上に作成する、**専用の裏方用Linuxユーザーアカウント**（例: `appuser`）です。

- **目的（最小権限の原則）:** 万が一アプリケーションの脆弱性を突かれて乗っ取られても、被害を「そのアプリの権限範囲内のみ」に封じ込めるためです。システムの全権限を持つ `root` や、強力な権限（sudo等）を持つ `ubuntu` ユーザーでの実行は避けます。
- **設定のベストプラクティス:**
  人間やCI/CDがネットワーク越しにこのユーザーとしてログインできないよう、ユーザー作成時にOSレベルでログインを強制的に遮断します。
  ```bash
  # ログイン不可（/sbin/nologin）なシステムアカウントとして作成
  sudo useradd -r -s /sbin/nologin appuser
  ```

---

## 3. AWS Academy環境でのセキュアな実現フロー（CI/CD + systemd 構築マニュアル）

動的DNS（DuckDNSなど）とsystemdを用いてIPを自動更新する環境において、CI/CDによる自動デプロイを安全かつ確実に実行するための構築手順です。

### 準備編: EC2サーバー上での事前作業

デプロイを自動化する前に、EC2インスタンス（`ubuntu`ユーザーでログイン）で以下の準備を一度だけ行います。

1. **実行ユーザーの作成:**
   ```bash
   sudo useradd -r -s /sbin/nologin appuser
   ```
2. **アプリケーション配置用ディレクトリの作成と権限設定:**
   ```bash
   sudo mkdir -p /var/www/myapp
   sudo chown ubuntu:ubuntu /var/www/myapp
   ```
3. **systemdユニットファイルの作成:**

   ```bash
   sudo nano /etc/systemd/system/myapp.service
   ```

   ```ini
   [Unit]
   Description=My Web Application
   After=network.target

   [Service]
   User=appuser
   Group=appuser
   WorkingDirectory=/var/www/myapp
   # systemdがroot権限でファイルを読み込み、環境変数としてappuserに渡す
   EnvironmentFile=/etc/opt/myapp/prod-secrets.env
   ExecStart=/usr/bin/python3 /var/www/myapp/app.py
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl daemon-reload
   ```

### Step 1: GitHub Actions Secrets の設定

GitHubリポジトリの `Settings` > `Secrets and variables` > `Actions` に以下を登録します。

**【接続用シークレット】**

- `EC2_HOST`: 設定した動的ドメイン（例: `my-app.duckdns.org`）
- `EC2_USERNAME`: `ubuntu`
- `EC2_SSH_KEY`: EC2の秘密鍵（`.pem`ファイルの中身全体）

**【アプリケーション用シークレット】**

- `DB_PASSWORD`, `API_KEY` など

### Step 2: ヘルスチェックの重要性と `ping` が不十分な理由

動的ドメインを利用する場合、「サーバーが起動してIPを更新した直後」にCI/CDが走ると、DNSの伝播遅延により古いIPを参照してデプロイが失敗する可能性があります。
これは、**Dockerの `depends_on` でコンテナの起動順序を制御しても、DB等のプロセス自体の準備完了を待つわけではないため接続エラーが起きる現象と同じ**です。Dockerに `healthcheck` が必要なように、CI/CDにも「サーバーの準備完了を待機する」仕組みが必要です。

**❌ `ping` による疎通確認が不適切な理由:**

1. **他人のインスタンスへの誤接続リスク:** AWSのパブリックIPは使い回されるため、古いIPが別のAWSユーザーのインスタンスに割り当てられていると `ping` は成功してしまいます。
2. **Security Groupの制限:** デフォルト設定ではICMP（pingの通信）がブロックされており、正しいサーバーでもエラーになることが多々あります。

**✅ 解決策:**
正しいSSH秘密鍵を用いて実際に接続テストを繰り返し行う（SSHポーリング）のが最も確実です。古いIP（他人のサーバー）に繋がっても鍵の違いで弾かれるため、自身のサーバーの準備が整うまで安全に待機できます。

### Step 3: CI/CDワークフローの実装

リポジトリの `.github/workflows/deploy.yml` を以下のように記述します。

```yaml
name: Deploy to EC2

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      # 1. SSH鍵のセットアップ（ヘルスチェック用）
      - name: Setup SSH Key for Healthcheck
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.EC2_SSH_KEY }}" > ~/.ssh/id_rsa
          chmod 600 ~/.ssh/id_rsa

      # 2. DNS伝播とサーバー起動の待機（SSHによるヘルスチェックループ）
      - name: Wait for DNS propagation and Server Readiness
        run: |
          echo "DNSの伝播とサーバーの準備を待機しています..."
          MAX_RETRIES=15
          WAIT_SECONDS=20

          for ((i=1; i<=MAX_RETRIES; i++)); do
            # タイムアウト5秒でSSH接続テスト。成功すればループを抜ける
            if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i ~/.ssh/id_rsa ${{ secrets.EC2_USERNAME }}@${{ secrets.EC2_HOST }} "echo 'ready'"; then
              echo "✅ SSH接続成功。DNS伝播とサーバーの準備が完了しました。"
              exit 0
            fi
            echo "試行 $i/$MAX_RETRIES 失敗。$WAIT_SECONDS 秒後に再試行します..."
            sleep $WAIT_SECONDS
          done

          echo "❌ タイムアウト: サーバーへの接続が確立できませんでした。"
          exit 1

      # 3. アプリケーションコードの転送
      - name: Copy files via scp
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USERNAME }}
          key: ${{ secrets.EC2_SSH_KEY }}
          source: "."
          target: "/var/www/myapp"

      # 4. シークレットファイルの動的生成・権限設定・アプリ再起動
      - name: Execute SSH commands and setup secrets
        uses: appleboy/ssh-action@v1.0.3
        env:
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
          API_KEY: ${{ secrets.API_KEY }}
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USERNAME }}
          key: ${{ secrets.EC2_SSH_KEY }}
          envs: DB_PASSWORD,API_KEY
          script: |
            sudo mkdir -p /etc/opt/myapp

            # 【重要】環境変数ファイルの動的生成
            echo "DB_PASSWORD=${DB_PASSWORD}" | sudo tee /etc/opt/myapp/prod-secrets.env > /dev/null
            echo "API_KEY=${API_KEY}" | sudo tee -a /etc/opt/myapp/prod-secrets.env > /dev/null

            # 【重要: LFI対策】シークレットファイルの所有者をrootにし、権限を400に絞る
            # ※appuserからは読み取れないため、ディレクトリトラバーサルの脆弱性を突かれても漏洩しません
            sudo chown root:root /etc/opt/myapp/prod-secrets.env
            sudo chmod 400 /etc/opt/myapp/prod-secrets.env

            # アプリケーションコードの所有権のみ実行ユーザー(appuser)に変更
            sudo chown -R appuser:appuser /var/www/myapp

            # systemdを使用してアプリケーションを再起動
            sudo systemctl restart myapp.service
            sudo systemctl status myapp.service --no-pager
```
