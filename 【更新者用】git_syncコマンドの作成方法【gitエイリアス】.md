毎回git pullするのが面倒くさいので、それを省略するためのコマンド

```bash
git config --local alias.sync '!git add . && git commit -m "update memo" && git pull --rebase origin main && git push origin main'
```

上記コマンドを実行してから

```bash
git sync
```

を打てばOK
