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

ここからは、実際にGitHub Actionsとsystemdを用いて、EC2インスタンス上にセキュアなデプロイ環境を構築するための具体的な実装手順を解説します。人間が実行ユーザーとしてログインしたり、`su`コマンドで切り替えたりすることは一切ありません。

### 準備編: EC2サーバー上での事前作業

デプロイを自動化する前に、EC2インスタンス（`ubuntu`ユーザーでログイン）で以下の準備を一度だけ行います。

1. **実行ユーザーの作成:**
   ```bash
   sudo useradd -r -s /sbin/nologin appuser
   ```
2. **アプリケーション配置用ディレクトリの作成と権限設定:**
   ```bash
   # 例として /var/www/myapp にアプリを配置する場合
   sudo mkdir -p /var/www/myapp
   sudo chown ubuntu:ubuntu /var/www/myapp  # 一旦ubuntuユーザーがファイルを置けるようにする
   ```
3. **systemdユニットファイルの作成:**

   ```bash
   sudo nano /etc/systemd/system/myapp.service
   ```

   以下の内容を記述して保存します。

   ```ini
   [Unit]
   Description=My Web Application
   After=network.target

   [Service]
   User=appuser
   Group=appuser
   WorkingDirectory=/var/www/myapp
   # ここで安全なディレクトリに配置したシークレットファイルを読み込む
   EnvironmentFile=/etc/opt/myapp/prod-secrets.env
   # アプリケーションの起動コマンド（例: GunicornやNode.jsなど）
   ExecStart=/usr/bin/python3 /var/www/myapp/app.py
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

   作成後、systemdに変更を認識させます。

   ```bash
   sudo systemctl daemon-reload
   ```

### Step 1: GitHub Actions Secrets の設定

GitHubリポジトリの `Settings` > `Secrets and variables` > `Actions` に移動し、以下のシークレットを登録します。

**【接続用シークレット】**

- `EC2_HOST`: EC2インスタンスのパブリックIPv4アドレス（例: `198.51.100.1`）
- `EC2_USERNAME`: 接続ユーザー名（基本は `ubuntu`）
- `EC2_SSH_KEY`: EC2作成時にダウンロードした秘密鍵（`.pem`ファイル）の中身全体

**【アプリケーション用シークレット（環境変数として渡すもの）】**

- `DB_PASSWORD`: データベースのパスワードなど
- `API_KEY`: 外部APIのキーなど

### Step 2: CI/CDワークフロー（デプロイ自動化）の実装

リポジトリの `.github/workflows/deploy.yml` を作成し、以下のように記述します。このYAMLファイルがデプロイと環境変数受け渡しの心臓部になります。

```yaml
name: Deploy to EC2

on:
  push:
    branches:
      - main # mainブランチへのpush時に実行

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      # 1. アプリケーションコードのサーバーへの転送
      - name: Copy files via scp
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USERNAME }}
          key: ${{ secrets.EC2_SSH_KEY }}
          source: "."
          target: "/var/www/myapp"

      # 2. シークレットファイルの動的生成・権限設定・アプリ再起動
      - name: Execute SSH commands and setup secrets
        uses: appleboy/ssh-action@v1.0.3
        env:
          # GitHub Secretsから読み込んだ値を、このステップ内の環境変数としてセットする
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
          API_KEY: ${{ secrets.API_KEY }}
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USERNAME }}
          key: ${{ secrets.EC2_SSH_KEY }}
          envs: DB_PASSWORD,API_KEY # 上記で定義したenvをリモートサーバーのスクリプトに渡す
          script: |
            # Webルートからアクセスできない安全なディレクトリを作成
            sudo mkdir -p /etc/opt/myapp

            # 【超重要】環境変数ファイル(.env)の動的生成
            # パスワード等に記号が含まれることを考慮し、echoやteeコマンドで安全に書き込む
            # 注: '>' で新規作成、'>>'（tee -a） で追記
            echo "DB_PASSWORD=${DB_PASSWORD}" | sudo tee /etc/opt/myapp/prod-secrets.env > /dev/null
            echo "API_KEY=${API_KEY}" | sudo tee -a /etc/opt/myapp/prod-secrets.env > /dev/null

            # 【重要】ファイルの所有者を実行ユーザー(appuser)に変更
            sudo chown appuser:appuser /etc/opt/myapp/prod-secrets.env

            # 【重要】パーミッションを400(所有者の読み取り専用)に変更。他者は一切アクセス不可
            sudo chmod 400 /etc/opt/myapp/prod-secrets.env

            # 転送したアプリケーションコード自体の所有者もappuserに変更しておく
            sudo chown -R appuser:appuser /var/www/myapp

            # systemdを使用してアプリケーションを再起動（ここでappuser権限で立ち上がる）
            sudo systemctl restart myapp.service

            # 起動ステータスの確認（エラーがあればGitHub Actionsのログで気付けるようにする）
            sudo systemctl status myapp.service --no-pager
```

### 実装フローのまとめとセキュリティのポイント

この実装により、以下の堅牢なフローが完成します。

1. GitHub Actionsは `ubuntu` ユーザーとして接続し、コードとシークレットファイルを配置します。
2. 配置された `prod-secrets.env` は、**OSの権限設定（chown/chmod 400）**によって `appuser` 以外からは完全に秘匿されます。
3. `ubuntu` ユーザーは `sudo systemctl restart myapp.service` を実行し、自分自身はログアウトします。
4. systemd は、指定された `appuser` になりかわり、厳重に守られた `prod-secrets.env` をメモリ上に読み込んでからプロセスを起動します。

これにより、AWS Academyの制限下においても、一切のパスワード入力を介さずに**「ディスク上の平文を最小限の権限で守り抜く」**という実務レベルのセキュアなCI/CDパイプラインが実現できます。
