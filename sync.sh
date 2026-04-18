#!/bin/bash
git add .
git commit -m "update memo"
git pull --rebase origin main
git push origin main