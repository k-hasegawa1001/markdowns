# 【最終回】Docker Hubを活用した本番環境デプロイ手順

これまでの授業では、EC2上にソースコードを持っていき、そこでコンテナと紐付けていました（開発環境の構成）。
今回は実務の「本番環境」と同じアプローチを体験します。手元のPCでアプリを内包した「完成品のイメージ」を作り、Docker Hubを経由してEC2へデプロイします。

**最大のポイント：今回のEC2上には、HTMLファイルもDockerfileも不要です！**

---

## 1. ローカルPCでの作業（イメージの作成と登録）

手元のPC（VSCode等）で作業を行います。

### 1-1. ファイルの準備

今回はソースコードをイメージの中に焼き付けるため、`Dockerfile` を使用します。以下の構成でファイルを作成してください。

```text
my-prod-app/
 ├── Dockerfile
 └── src/
      └── index.html
```

**1. Dockerfile**
`COPY` コマンドを使って、手元のHTMLファイルをコンテナイメージの中に組み込みます。

```dockerfile
FROM nginx:alpine

# 手元の src フォルダの中身を、コンテナ内のNginx公開ディレクトリにコピー（焼き付ける）
COPY src/ /usr/share/nginx/html/
```

**2. src/index.html**

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Production Docker Test</title>
  </head>
  <body>
    <h1>本番環境（Docker Hub経由）デプロイ成功！</h1>
    <p>このページは、HTMLが完全に組み込まれた独立したコンテナから配信されています。</p>
  </body>
</html>
```

### 1-2. Docker Hubへのログイン

ターミナル（コマンドプロンプトやVSCodeのターミナル）を開き、Docker Hubへログインします。

```bash
docker login
```

※ユーザー名とパスワード（またはアクセストークン）を求められるので入力してください。

### 1-3. イメージのビルド（作成）

自分のDocker Hubアカウント名をつけて、イメージをビルドします。
※ `<あなたのユーザー名>` の部分は、実際のDocker Hubのユーザー名に書き換えてください。

```bash
docker build -t <あなたのユーザー名>/my-prod-app:1.0 .
```

（最後の `.` は「現在のディレクトリにあるDockerfileを使う」という意味なので忘れないように！）

### 1-4. Docker Hubへプッシュ（アップロード）

作成したイメージをDocker Hubへアップロードします。

```bash
docker push <あなたのユーザー名>/my-prod-app:1.0
```

これで「完成品のサーバー」がインターネット上の保管庫（レジストリ）に保存されました。ブラウザでDocker Hubを開き、自分のリポジトリにイメージが追加されているか確認してみましょう。

---

## 2. AWS EC2での作業（デプロイ）

ここからはAWS Academyのターミナルを開き、EC2インスタンスに接続して作業します。
**※今回は `git clone` は行いません！**

### 2-1. docker-compose.yml の作成

EC2のターミナル上で `vi`（または `nano`）コマンドを使い、ファイルを作成します。

```bash
vi docker-compose.yml
```

以下の内容を記述して保存します。
※ `image:` の部分は、先ほど自分がプッシュした名前に書き換えてください。

```yaml
services:
  web:
    # Docker Hubにある自分の完成品イメージを直接指定する
    image: <あなたのユーザー名>/my-prod-app:1.0
    ports:
      - "80:80"
```

### 2-2. コンテナの起動

EC2上にあるのは、たった今作成した `docker-compose.yml` 1つだけです。この状態で以下のコマンドを実行します。

```bash
docker compose up -d
```

EC2が自動的にDocker Hubからあなたのイメージをダウンロード（プル）し、Webサーバーが起動します。

---

## 3. ブラウザからアクセス確認

EC2の「パブリック IPv4 アドレス」をブラウザに入力してアクセスします。
設定したHTMLが表示されれば、本番環境構成でのデプロイは完璧に成功です！

**【確認してみよう】**
EC2上で `ls` コマンドを打ってみてください。`src` フォルダや `index.html` は存在しませんよね？
コードはすべて「コンテナイメージの中」に安全にカプセル化されています。これがモダンなインフラの実務的な運用方法です。
