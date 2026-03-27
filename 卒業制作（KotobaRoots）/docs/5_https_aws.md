# 🔒 AWSのセキュリティ設定 (SSL/HTTPS化)

このドキュメントでは、お金をかけずに（ドメインを購入せずに）、Webサイトを安全な **HTTPS (鍵マーク付き)** にする方法を解説します。

**前提:**

- AWS Academy (Learner Lab)
- OS: Amazon Linux 2023
- **Elastic IP (固定IP)** を取得済みであること

---

## 1. そもそもなぜHTTPSが必要なのか？

今のWeb業界では、HTTPS化は「マナー」ではなく「必須」です。
`http://` のままだと、以下のようなデメリットがあります。

1.  **ブラウザに怒られる:** Chromeなどで「保護されていない通信」と警告が出て、怪しいサイト扱いされる。
2.  **機能が使えない:** スマホのカメラやマイク、位置情報などの機能は、HTTPSでないと動作しない。
3.  **通信が丸見え:** パスワードなどを盗み見られるリスクがある。

通常、HTTPSにするには「ドメイン（有料）」が必要ですが、今回は **`nip.io`** という魔法のサービスを使って無料で突破します。

---

## 2. 【準備】AWSの「ファイアウォール」を開ける

まず、SSL通信で使う「443番ポート」を開ける必要があります。

1.  AWSコンソールで EC2 > セキュリティグループ を開く。
2.  「インバウンドルールを編集」をクリック。
3.  以下のルールを追加して保存する。

| タイプ    | プロトコル | ポート範囲 | ソース                   | 説明         |
| :-------- | :--------- | :--------- | :----------------------- | :----------- |
| **HTTPS** | TCP        | **443**    | **0.0.0.0/0** (Anywhere) | SSL接続用    |
| **HTTP**  | TCP        | **80**     | **0.0.0.0/0** (Anywhere) | 証明書発行用 |

---

## 3. 【手順】サーバー内での設定

ここからは、ターミナルで本番サーバー（EC2）にSSH接続して作業します。

### STEP 1: 自分の「ドメイン名」を決める

`nip.io` は、「IPアドレスの後ろにつけるだけ」でドメインとして使えるサービスです。

あなたのElastic IPが `54.123.45.67` だとしたら、
あなたのドメイン名は **`54.123.45.67.nip.io`** になります。

これをブラウザのアドレスバーに入れて、今のサイト（http）が表示されるか確認してください。
（※表示されない場合は、Nginxが起動していないか、IPが間違っています）

### STEP 2: SSL化ツール (Certbot) のインストール

Amazon Linux 2023 に対応したツールをインストールします。

```bash
# ツールのインストール
sudo dnf install -y python3-certbot-nginx
```

### STEP 3: Nginxの設定ファイルを編集する

Nginxに「このサーバーのドメイン名はこれだよ！」と教えてあげる必要があります。

```bash
# 設定ファイルを開く (ファイル名は環境に合わせて修正してください)
# 例: sudo nano /etc/nginx/conf.d/kotobaroots.conf
# もし conf.d を使っていなければ /etc/nginx/nginx.conf かもしれません
sudo nano /etc/nginx/conf.d/[あなたの設定ファイル].conf
```

ファイルの中にある `server_name` の部分を、先ほどの `nip.io` のドメインに書き換えます。

```nginx
server {
    listen 80;
    # ↓ ここを書き換える！
    server_name 54.123.45.67.nip.io;

    location / {
        # ... (その他の設定はそのまま) ...
    }
}
```

書き換えたら保存し、Nginxを再読み込みします。

```bash
# 設定にミスがないかテスト
sudo nginx -t

# 再読み込み
sudo systemctl reload nginx
```

### STEP 4: 証明書の発行（運命の瞬間）

いよいよSSL証明書を発行します。以下のコマンドを実行してください。

```bash
sudo certbot --nginx
```

コマンドを実行すると、いくつか質問されます。

1.  **Email address:** メールアドレスを入力（学校のアドレスなどでOK）。
2.  **Terms of Service:** 利用規約。 `Y` (Yes) を入力。
3.  **Share Email:** メールを公開するか。 `N` (No) でOK。
4.  **Which names:** どのドメインをSSL化するか。リストに `nip.io` のドメインが出ていれば、その番号を入力（例: `1`）。

最後に **`Successfully received certificate.`** と表示されれば大成功です！🎉

### STEP 5: 【重要】起動時の自動更新チェックを設定する

AWS AcademyのLabは、授業期間外など長期間停止することがあります。
「久しぶりに起動したら証明書が切れていて真っ赤な画面が出た！」という事故を防ぐため、**サーバー起動時に必ず更新チェックが走る設定**を追加します。

以下のコマンドをすべてコピーして実行してください。

```bash
# 1. 起動時にCertbotを実行する設定ファイルを作成
sudo tee /etc/systemd/system/certbot-boot-renew.service <<EOF
[Unit]
Description=Certbot Renewal on Boot
After=network-online.target nginx.service

[Service]
Type=oneshot
# 起動直後はネットワーク準備などでコケることがあるので少し待つ
ExecStartPre=/bin/sleep 10
# 更新を試行し、必要ならNginxをリロードする
ExecStart=/usr/bin/certbot renew --post-hook "systemctl reload nginx"

[Install]
WantedBy=multi-user.target
EOF

# 2. 設定を反映して有効化
sudo systemctl daemon-reload
sudo systemctl enable certbot-boot-renew.service
```

これで、久しぶりにサーバーを立ち上げても勝手に証明書が更新されるようになります。

---

## 4. 【重要】フロントエンドの修正

サーバーがHTTPSになると、**フロントエンド（Reactなど）の設定も変更が必要**です。
なぜなら、HTTPSのサイトから HTTPのAPI（バックエンド）を叩くと、ブラウザが「危険！」と判断して通信をブロックするからです（Mixed Content エラー）。

### やるべきこと

フロントエンドのコード内で、バックエンドAPIのURLを指定している箇所（`.env` ファイルや `config.js` など）を書き換えてください。

- 変更前: `http://54.123.45.67/api`
- 変更後: `https://54.123.45.67.nip.io/api`

書き換えたら、フロントエンドを再度ビルドして、サーバーにデプロイし直す必要があります。

---

## 5. 🚑 トラブルシューティング

<details>
<summary><b>Q. Certbotコマンドが見つからない (command not found)</b></summary>

**原因:** インストールがうまくいっていません。
**対処:** Amazon Linux 2023以外のOSを使っている可能性があります。
`cat /etc/os-release` でOSを確認し、そのOSに合ったCertbotのインストール方法を検索してください。

</details>

<details>
<summary><b>Q. 証明書の発行でエラーが出る (Challenge failed)</b></summary>

**原因:** 80番ポートが開いていないか、Nginxの `server_name` が間違っています。
**対処:**

1. AWSのセキュリティグループでポート80が `0.0.0.0/0` になっているか再確認。
2. `http://54.123.45.67.nip.io` にアクセスしてページが表示されるか確認。表示されなければNginxの設定ミスです。
</details>

<details>
<summary><b>Q. 90日後に証明書が切れる？</b></summary>

通常は `certbot` が自動更新タイマーをセットしてくれていますが、Lab環境ではサーバーが停止している時間が長いため、**STEP 5** の設定が非常に重要になります。これを行っていれば、起動するたびにチェックされるので安心です。

</details>
