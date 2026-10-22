/** 相談窓口の静的案内。入力内容の判定・自動応答は行わない。 */
export function SupportInfo() {
  return (
    <section className="card" aria-labelledby="support-h">
      <h2 id="support-h">つらいときの相談先</h2>
      <p>
        ぶひろぐは診断や治療の判断をしません。つらさが強いとき、眠れない・食べられない状態が続くとき、
        自分を傷つけたい気持ちがあるときは、ひとりで抱えず、主治医や身近な人、下の窓口に相談してください。
      </p>
      <ul>
        <li>命の危険があるとき：<a href="tel:119">119</a>（救急）／<a href="tel:110">110</a>（警察）</li>
        <li>よりそいホットライン（24時間・無料）：<a href="tel:0120279338">0120-279-338</a></li>
        <li>いのちの電話（ナビダイヤル）：<a href="tel:0570783556">0570-783-556</a></li>
      </ul>
      <p className="muted">窓口の電話番号や受付時間は変わることがあります。最新の情報は各窓口の公式サイトで確認してください。</p>
    </section>
  );
}

export function SharedDeviceNotice() {
  return (
    <section className="card" aria-labelledby="share-h">
      <h2 id="share-h">端末の共有とデータの扱い</h2>
      <ul>
        <li>記録はこの端末のブラウザ内だけに保存されます。外部のサーバーやAIには送信しません。</li>
        <li>このアプリにはパスコードがありません。端末を家族や他の人と共有している場合は、画面を見られないようご注意ください。</li>
        <li>バックアップファイルには記録がそのまま入ります。保存先や共有先に気をつけてください。</li>
        <li>ブラウザのデータ消去や端末の故障で記録が消えることがあります。定期的にバックアップを取ってください。</li>
      </ul>
    </section>
  );
}

export function InstallGuide() {
  return (
    <section className="card" aria-labelledby="install-h">
      <h2 id="install-h">iPhoneのホーム画面に追加する</h2>
      <ol>
        <li>Safariでこのページを開きます（Chromeではなく Safari）。</li>
        <li>画面下の共有ボタン（□に↑）を押します。</li>
        <li>「ホーム画面に追加」→「追加」を押します。</li>
      </ol>
      <p className="muted small">以後はホーム画面のアイコンから開いてください。Safariのタブのままだと、しばらく使わないときに記録が消えることがあります。</p>
    </section>
  );
}
