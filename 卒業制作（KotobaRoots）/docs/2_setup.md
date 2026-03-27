# 🛠️ サーバー初期セットアップ手順

このドキュメントでは、AWS EC2を立ち上げた直後にやるべき**「本番環境特有の設定」**を解説します。

## ⚠️ 【最重要】コピペする前の注意点

このマニュアルでは、例としてアプリ名を **`kotobaroots`** としています。
あなたのチームのアプリ名やリポジトリ名が違う場合は、**必ず以下の部分を自分の環境に合わせて書き換えてください。**

| 項目             | マニュアルの記述 (例) | あなたが書き換える内容          |
| :--------------- | :-------------------- | :------------------------------ |
| **リポジトリ名** | `kotobaroots_back`    | あなたのGitHubリポジトリ名      |
| **サービス名**   | `kotobaroots`         | あなたのアプリ名 (例: `my_app`) |
| **ユーザー名**   | `k-hasegawa1001`      | あなたのGitHub ID               |

---

## 1. 基本的なセットアップ (Clone & Install)

まず、アプリケーションのコードをサーバーに持ってきます。

```bash
# 1. システム更新とGit/Pythonのインストール
sudo dnf update -y
sudo dnf install -y git python3 python3-pip nginx

# 2. クローン (ホームディレクトリにて)
cd /home/ec2-user
# ↓ 【書き換え】自分のリポジトリURLにしてください！
git clone https://github.com/[あなたのユーザー名]/[あなたのリポジトリ名].git

# ↓ 【書き換え】クローンしたフォルダ名に入る
cd [あなたのリポジトリ名]

# 3. 仮想環境の作成とインストール
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 4. 【重要】本番用サーバーソフト (Gunicorn) の追加インストール
pip install gunicorn
```

---

## 2. 【重要】本番環境用の .env 設定

サーバー上で `.env` ファイルを作成します。

```bash
nano .env
```

**書き込む内容の例 (本番用):**

```text
FLASK_ENV=production
FLASK_DEBUG=False

# ↓ 【書き換え】後で取得するElastic IPを入れる
FRONTEND_URL="http://54.x.x.x"

SECRET_KEY=very-complex-random-secret-key-12345
JWT_SECRET_KEY=another-complex-secret-key-67890
JWT_COOKIE_SECURE=False
OPENAI_API_KEY=sk-proj-xxxxxxxx
```

---

## 3. Gunicornの自動起動設定 (Systemd)

アプリが落ちても勝手に再起動するように設定します。
ファイル名も自分のアプリ名にすると分かりやすいです。

```bash
# 設定ファイルを作成
# ↓ 【書き換え】kotobaroots の部分を自分のアプリ名にする (例: myapp.service)
sudo nano /etc/systemd/system/kotobaroots.service
```

**貼り付ける内容:**

```ini
[Unit]
Description=Gunicorn instance to serve My App
After=network.target

[Service]
User=ec2-user
Group=ec2-user

# ↓ 【書き換え】自分のリポジトリのパスに修正！
WorkingDirectory=/home/ec2-user/kotobaroots_back
Environment="PATH=/home/ec2-user/kotobaroots_back/venv/bin"

# ↓ 【書き換え】実行コマンドのパスも修正！
# 最後の apps.app:create_app() は、Flaskの起動ファイルに合わせて変更が必要
ExecStart=/home/ec2-user/kotobaroots_back/venv/bin/gunicorn \
    --workers 3 \
    --bind 127.0.0.1:8000 \
    apps.app:create_app()

Restart=always

[Install]
WantedBy=multi-user.target
```

**起動と確認:**

```bash
sudo systemctl daemon-reload

# ↓ 【書き換え】ファイル名を kotobaroots.service 以外にした場合はここも変える
sudo systemctl start kotobaroots
sudo systemctl enable kotobaroots

# ステータス確認 (緑色で active (running) ならOK)
sudo systemctl status kotobaroots
```

---

## 4. Nginx (リバースプロキシ) の設定

```bash
# 設定ファイル作成
# ↓ 【書き換え】ファイル名を自分のアプリ名.conf にする
sudo nano /etc/nginx/conf.d/kotobaroots.conf
```

**貼り付ける内容:**

```nginx
server {
    listen 80;
    server_name _;

    location / {
        # Gunicornのポート(8000)へ転送
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**Nginxの起動:**

```bash
# デフォルト設定の無効化
sudo rm /etc/nginx/sites-enabled/default

### もしこれでNginxの標準インデックスが表示されたら
`
ls -l /etc/nginx/sites-available/
`
を実行\
中身を確認して{my_app}という設定（.service）が存在しているか（有効になっているか）を確認\
もし存在していなかったら
`sudo nano /etc/nginx/sites-available/myapp`
を実行\
`
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
`\
上記を貼り付け\
終わったら`sudo ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/`を実行\
次に`sudo rm /etc/nginx/sites-enabled/default`を実行

# テストして再起動

sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

```

---

### 🎉 セットアップ完了！

ブラウザで `http://[Elastic IP]` にアクセスして表示されれば成功です！

```

```
