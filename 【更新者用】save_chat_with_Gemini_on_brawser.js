(function () {
  // 抽出用のベースHTMLを作成
  let htmlContent = `
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
                .user { background-color: #f0f0f0; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                .model { padding: 15px; margin-bottom: 30px; border-bottom: 1px solid #ccc; }
                pre { background: #2d2d2d; color: #fff; padding: 10px; border-radius: 5px; overflow-x: auto; font-family: monospace; }
                code { font-family: monospace; background: #eee; padding: 2px 4px; border-radius: 3px; color: #333; }
                pre code { background: none; color: inherit; padding: 0; }
            </style>
        </head>
        <body>
            <h1>チャット履歴エクスポート</h1>
    `;

  // ユーザーとモデルのテキストを含む要素を大まかに取得
  const messageBlocks = document.querySelectorAll(
    "user-query, message-content, [data-message-author-role]",
  );

  if (messageBlocks.length === 0) {
    console.error(
      "メッセージ要素が見つかりませんでした。画面構造が変更されている可能性があります。",
    );
    return;
  }

  messageBlocks.forEach((block) => {
    const isUser =
      block.tagName.toLowerCase() === "user-query" ||
      block.getAttribute("data-message-author-role") === "user";
    const className = isUser ? "user" : "model";
    const prefix = isUser
      ? "<strong>あなた:</strong><br>"
      : "<strong>AI:</strong><br>";

    // 内部のHTMLをそのまま取得（コードブロックなども保持）
    htmlContent += `<div class="${className}">${prefix}${block.innerHTML}</div>`;
  });

  htmlContent += `</body></html>`;

  // Blobとしてダウンロードをトリガー
  const blob = new Blob([htmlContent], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chat_export.html";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log(
    "エクスポートが完了しました。ダウンロードしたHTMLを開き、ブラウザの印刷(Ctrl+P)からPDF保存してください。",
  );
})();
