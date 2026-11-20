# 갓생 살자! 生產力小幫手

個人生產力 webapp：月／週／日計畫、待辦（步驟、標籤、倒數）、甘特圖、行程提醒、日記與記帳、靈感筆記。

- 單一 `index.html`，純 HTML/CSS/JavaScript，不需要安裝。
- 資料只存在使用者自己的瀏覽器（localStorage），不會上傳到任何伺服器。可在「設定」匯出／匯入備份。
- 提醒需要網頁保持開啟。

## 授權與來源

- 台灣縣市地圖資料改寫自 [taiwan-atlas](https://github.com/dkaoster/taiwan-atlas)（MIT License, Copyright (c) 2020 Daniel Kao）。

## 共學揪課報名（`class/`）

獨立的小工具，網址 `https://shinju-ruby.github.io/careeveryday/class/`。家長點連結選日期、填寶貝名字就完成報名；依報名先後自動排正取／備取，有人取消自動遞補；費用依正取人數均分；主揪後台可追蹤繳費、一鍵複製開課公告、報名統計、上課通知、催繳訊息貼到 LINE。

- 資料存在 Firebase Firestore（`cl_courses`、`cl_signups`、`cl_pay`），保護靠 `class/firestore.rules.txt` 的安全規則。前端沒有任何秘密金鑰。
- 家長自動以匿名身分連線（不用登入），主揪用 Google 登入。
- 網址加 `?demo=1` 可在本機試玩，不會寫到雲端。
