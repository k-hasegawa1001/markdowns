# Dockerコンテナのライフサイクル管理と安全対策ガイド

## 1. 基本概念：コンテナの生死と PID 1

Dockerコンテナは、**「PID 1（プロセスID 1番）のプロセスが稼働している間だけ生き続ける」**という鉄則があります。

| PID 1 のプロセス     | 挙動の特徴                   | 停止条件                                                              |
| :------------------- | :--------------------------- | :-------------------------------------------------------------------- |
| **`/bin/bash`**      | 入力待ち受けが必要。         | 入力がない（`-it`がない）と即終了。<br>ユーザーが `exit` すると終了。 |
| **`sleep infinity`** | 何もしないで待機し続ける。   | 基本的に終了しない（明示的なKillが必要）。                            |
| **`nginx`, `mysql`** | バックグラウンドで常駐する。 | サービス停止コマンドやエラーで終了。                                  |

### `docker run` のオプションによる挙動の違い

- **`-d` (Detach):** バックグラウンドで実行。
- **`-i` (Interactive):** 標準入力を開く（入力待機状態にする）。
- **`-t` (TTY):** 疑似ターミナルを割り当てる（プロンプトを表示させる）。

**【重要】**

- `bash` を PID 1 にする場合： **`-dit` が必須**（`-it`がないと即死する）。
- `sleep infinity` を PID 1 にする場合： **`-d` だけでOK**（入力不要なため）。

---

## 2. 安全な運用パターン：Sleep Infinity

作業用コンテナ（踏み台サーバーなど）において、誤ってコンテナを停止させないためのベストプラクティスです。

### 従来の危険なパターン（PID 1 = bash）

```bash
docker run -dit --name my-box ubuntu /bin/bash
```

- **リスク:** 後から `attach` で入って作業し、終了時に癖で `exit` を打つと、PID 1 が終了してコンテナごと停止する。

### 推奨される安全パターン（PID 1 = sleep infinity）

```bash
docker run -d --name safe-box ubuntu sleep infinity
```

- **運用方法:**
  1.  起動は `sleep infinity` (PID 1) に任せる。
  2.  作業時は **`exec`** で新しいプロセス (PID X) を作って入る。
      ```bash
      docker exec -it safe-box /bin/bash
      ```
  3.  作業が終わって `exit` しても、死ぬのは PID X だけ。PID 1 は生き続けるためコンテナは落ちない。

---

## 3. 「Attachの罠」と緊急脱出方法

`sleep infinity` で動いているコンテナに誤って `docker attach` すると、入力を受け付けないため画面がフリーズしたようになります。

### ❌ やってはいけない操作

- **`Ctrl` + `C`** を押す。
  - **結果:** SIGINTシグナルが PID 1 に送られ、`sleep` プロセスが終了し、**コンテナが墜落する。**

### ✅ 正しい緊急脱出（デタッチ）

- **操作:** **`Ctrl` + `P`** を押し、続けて **`Ctrl` + `Q`** を押す。
  - **結果:** コンテナ（PID 1）を生かしたまま、ターミナル接続だけを切り離して元に戻れる。

### 🛡️ 高度な対策：PID 1 の不死身化

`docker run` 時にシグナルを無視する設定（trap）を仕込むことで、誤って `Ctrl+C` されても耐えるコンテナを作れます。

```bash
docker run -d ubuntu /bin/sh -c "trap : TERM INT; sleep infinity & wait"
```

- `trap : TERM INT`: 終了シグナル(TERM)と割り込み(INT/Ctrl+C)を無視する設定。

---

## 4. 本番運用：Systemd / Kubernetes による管理

ヒューマンエラー（誤停止）を前提とし、システム側で自動復旧させる構成です。

### A. Systemd (systemctl) での管理

Linuxサーバー上で、コンテナをOSのサービスとして管理します。
プロセスが落ちても `Restart=always` により数秒でゾンビのように蘇ります。

**`/etc/systemd/system/my-container.service`**

```ini
[Unit]
Description=My Safe Container
After=docker.service
Requires=docker.service

[Service]
Restart=always
# コンテナが死んだら無限に再起動する
ExecStart=/usr/bin/docker run --rm --name my_app ubuntu sleep infinity
ExecStop=/usr/bin/docker stop my_app

[Install]
WantedBy=multi-user.target
```

### B. Kubernetes (k8s) での管理

宣言的設定（マニフェスト）により、「常に存在する状態」を維持します。誤ってPodを消しても、即座に新しいPodが生成されます。

**`deployment.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: debug-pod
spec:
  replicas: 1
  selector:
    matchLabels:
      app: debug
  template:
    metadata:
      labels:
        app: debug
    spec:
      containers:
        - name: ubuntu
          image: ubuntu:22.04
          # 不死身待機コマンド
          command: ["sleep", "infinity"]
```

---

## 5. まとめ

1.  **コマンド:** `docker detatch` はない。抜けるときは `Ctrl+P` → `Ctrl+Q`。
2.  **実行:** 作業用コンテナなら `sleep infinity` で裏で飼っておくのが安全。
3.  **接続:** 基本は `docker exec -it` を使う。`attach` は使わない。
4.  **運用:** 本番環境では人間が管理せず、Systemdやk8sに「自動再起動」を任せる。
