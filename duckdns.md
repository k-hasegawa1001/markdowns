# 無料DDNS（DuckDNS）と systemd を用いたIP自動更新

AWS Academyの仕様上、ラボ起動時にEC2のIPアドレスが変わるため、`systemd` を用いてOS起動時に自動でDuckDNSへIPを通知する仕組みを構築する。

## 1. DuckDNSでドメインを取得する

1. [DuckDNS](https://www.duckdns.org/) にログインし、サブドメインを追加する。（例: `<任意のサブドメイン>`）
2. 画面上部の **Token** をメモする。

## 2. EC2インスタンスで更新スクリプトを作成する

```bash
mkdir ~/duckdns
cd ~/duckdns
nano duck.sh
```

以下の内容を保存する（DOMAINとTOKENを取得したものに書き換える）。

```bash
#!/bin/bash
DOMAIN="YOUR_DOMAIN"
TOKEN="YOUR_TOKEN"
curl -s "https://www.duckdns.org/update?domains=${DOMAIN}&token=${TOKEN}&ip=" -o /home/ubuntu/duckdns/duck.log
```

実行権限を付与する。

```bash
chmod 700 duck.sh
```

## 3. systemdで起動時に自動実行させる

```bash
sudo nano /etc/systemd/system/duckdns-update.service
```

以下の内容を保存する。

```ini
[Unit]
Description=Update DuckDNS IP on boot
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=ubuntu
ExecStart=/home/ubuntu/duckdns/duck.sh

[Install]
WantedBy=multi-user.target
```

サービスを有効化し、起動テストを行う。

```bash
sudo systemctl daemon-reload
sudo systemctl enable duckdns-update.service
sudo systemctl start duckdns-update.service
cat /home/ubuntu/duckdns/duck.log
```

`OK` と出力されていれば設定完了。
