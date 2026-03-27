# AWS EC2でのWebサーバー（Docker）構築手順

この手順では、手元のPCで作成したWebサイトのコードをGitHub経由でAWS EC2に転送し、Dockerの「バインドマウント」機能を使ってNginx（Webサーバー）を立ち上げます。

## 1. ローカルでの準備（ファイル作成）

今回は `Dockerfile` は使用しません。以下の構成でファイルを用意します。

```text
my-web-app/
 ├── docker-compose.yml
 └── src/
      └── index.html
```

### ファイルの記述内容

**1. docker-compose.yml**
Nginxの公式イメージを使用し、`volumes`（バインドマウント）を使って、手元の `src` フォルダをコンテナ内の公開用ディレクトリに紐付けます。

```yaml
services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./src:/usr/share/nginx/html
```

**2. src/index.html** (表示テスト用)

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Docker Bind Mount Test</title>
  </head>
  <body>
    <h1>バインドマウントでの起動成功！</h1>
    <p>このページはAWS EC2上のNginxコンテナから配信されています。</p>
  </body>
</html>
```

これらのファイルをコミットし、ご自身のGitHubリポジトリに `git push` してください。

---

## 2. AWS EC2での作業（デプロイ）

AWS Academyの画面からターミナルを開き、EC2インスタンスに接続します。

**1. GitHubからコードを取得（クローン）**

```bash
git clone <あなたのGitHubリポジトリのURL>
```

**2. ディレクトリの移動**

```bash
cd <クローンしたディレクトリ名>
```

**3. コンテナの起動**
以下のコマンドを実行します。今回はイメージのビルドは行わず、公式イメージをそのまま使って起動します。

```bash
docker compose up -d
```

**4. 起動確認**

```bash
docker compose ps
```

---

## 3. ブラウザからアクセス確認

EC2の「パブリック IPv4 アドレス」をブラウザに入力してアクセスします。
表示が確認できたら、EC2上で `vi src/index.html` コマンド等を使ってHTMLを書き換えてみましょう。コンテナを再起動しなくても、ブラウザをリロードするだけで変更が即座に反映される（バインドマウントの利点）ことが確認できます！
