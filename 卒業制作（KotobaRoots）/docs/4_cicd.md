# 🚀 自動デプロイ (CI/CD) の設定手順

このドキュメントでは、GitHubにコードをプッシュした瞬間に、本番サーバー（AWS EC2）の中身も自動で更新される仕組み（CI/CD）の作り方を説明します。

**前提環境:**

- AWS Academy (Learner Lab)
- OS: Amazon Linux 2023
- Git管理: mainブランチ
- **Elastic IP (固定IP)** を取得済みであること

## 📑 目次

1. [【重要】セキュリティとAWS Academyの制約について](#1-重要セキュリティとaws-academyの制約について)
2. [【手順】GitHubに鍵とIPを登録する](#2-手順githubに鍵とipを登録する)
3. [【手順】自動化ファイル (workflow) の作成](#3-手順自動化ファイル-workflow-の作成)
4. [🚑 トラブルシューティング](#4-トラブルシューティング)

---

## 1. 【重要】セキュリティとAWS Academyの制約について

### 🛡️ SSH接続の許可範囲（0.0.0.0/0）について

通常、本番環境のSSHポート（22番）は「自分のIPのみ」に限定するのが鉄則です。
しかし、本プロジェクトでは以下の理由から、**例外的に「Anywhere (0.0.0.0/0)」で開放**します。

1.  **GitHub Actionsの仕様:** 自動デプロイを行うサーバーのIPが毎回変わるため、特定のIPに絞れない。
2.  **AWS Academyの制約:** Lab環境は4時間でリセットされるため、複雑なIP制限を毎回設定するのが困難。

**⚠️ 絶対に守ること：秘密鍵の管理**
「入り口（ポート）」を全開放しているため、「鍵（秘密鍵）」が流出すると**世界中の誰でもサーバーに入り放題**になります。

- 秘密鍵（`.pem`ファイル）は絶対にGitHubに上げないでください。
- チームメンバーへの共有も慎重に行ってください（Discordなどに貼り付けない）。

### 💸 Elastic IP（固定IP）のコストについて

AWS Academy (Learner Lab) では、Elastic IPを取得していると、**EC2を停止していても「$0.005 / 時間」の予算が消費され続けます。**
授業期間外など、長期間使わない場合は必ず開放してください。

---

## 2. 【手順】GitHubに鍵とIPを登録する

GitHub ActionsがあなたのEC2にアクセスできるように、鍵と住所を教える必要があります。

### STEP 1: 必要な情報を手元に準備する

以下の3つを用意してください。

1.  **Elastic IPアドレス:**
    - EC2に割り当てたIPアドレス（例: `54.x.x.x`）
2.  **秘密鍵の中身:**
    - EC2作成時にダウンロードした **`.pem` ファイル**をメモ帳などで開いてください。
    - `-----BEGIN RSA PRIVATE KEY-----` から `-----END RSA PRIVATE KEY-----` までを**すべてコピー**します。（改行が入っていても問題ありません）
3.  **セキュリティグループの確認:**
    - AWSコンソールでセキュリティグループの「インバウンドルール」を確認してください。
    - ポート22 (SSH) が **`0.0.0.0/0` (Anywhere)** になっている必要があります。

### STEP 2: GitHub Secretsに登録する

1. GitHubのリポジトリページを開く。
2. 上部タブの `Settings` をクリック。
3. 左サイドバーの `Secrets and variables` > `Actions` をクリック。
4. `New repository secret` ボタンを押し、以下の3つを登録してください。

| Name (名前)     | Secret (値の例) | 説明                          |
| :-------------- | :-------------- | :---------------------------- |
| **EC2_HOST**    | `54.123.45.67`  | 取得したElastic IPアドレス    |
| **EC2_USER**    | `ec2-user`      | Amazon Linux 2023のユーザー名 |
| **EC2_SSH_KEY** | `-----BEGIN...` | `.pem`ファイルの中身全部      |

---

## 3. 【手順】自動化ファイル (workflow) の作成

GitHub Actionsを動かすための設定ファイルを作ります。

1. プロジェクトのルートディレクトリで、以下の階層になるようにフォルダを作ります。
   `.github/workflows/deploy.yml`
2. `deploy.yml` に以下の内容をコピペし、**「修正箇所」**を自分の環境に合わせて書き換えてください。

```yaml
name: Deploy to AWS Academy EC2

on:
  push:
    branches:
      - main # mainブランチにプッシュされた時だけ動く

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_KEY }}
          port: 22
          script: |
            # --- ⚠️ ここから下をご自身のフォルダ名に合わせて修正してください ---

            # 1. プロジェクトの場所に移動
            # 例: cd /home/ec2-user/kotobaroots_back
            cd /home/ec2-user/[あなたのリポジトリ名]

            # 2. 最新コードを強制的に反映 (git fetch & reset)
            # ※ git pull ではなく reset を使うことで、競合エラーを確実に防ぎます
            git fetch origin main
            git reset --hard origin/main

            # 3. 依存関係の更新 (仮想環境 venv を使用している場合)
            source venv/bin/activate
            pip install -r requirements.txt

            # 4. サーバー再起動 (アプリ名に合わせて修正)
            # 修正例: sudo systemctl restart kotobaroots
            sudo systemctl restart [あなたのサービス名]

            # -----------------------------------------------------
            echo "🎉 Deployment Success!"
```

### ✅ ファイルを作ったら

このファイルをGitHubに `push` してみてください。
`Actions` タブを見て、緑色のチェックマーク✅がつけば成功です！

---

## 4. 🚑 トラブルシューティング

エラーが起きた場合は、GitHubの「Actions」タブからログを確認してください。

<details>
<summary><b>Q. 「dial tcp ... i/o timeout」というエラーが出る</b></summary>

**原因:** GitHubからEC2へのSSH接続がブロックされています。
**対処:** AWSのセキュリティグループ設定で、ポート22（SSH）のソースが `0.0.0.0/0` (Anywhere) になっているか確認してください。「マイIP」になっていると失敗します。

</details>

<details>
<summary><b>Q. 「Load key ... invalid format」というエラーが出る</b></summary>

**原因:** Secretsに登録した鍵の形式が間違っています。
**対処:** `.pem` ファイルの中身をコピーする際、最初(`-----BEGIN...`)から最後(`...KEY-----`)まで、改行を含めてすべてコピーできているか確認してください。

</details>

<details>
<summary><b>Q. 「No such file or directory」が出る</b></summary>

**原因:** `cd` コマンドで指定したフォルダがサーバー上にありません。
**対処:**

1. まだ一度もサーバーにコードを置いていない場合は、手動でSSH接続し、`git clone` を実行してください。
2. クローン済みの場合は、フォルダ名が合っているか確認してください（大文字・小文字に注意）。
</details>
