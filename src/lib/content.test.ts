import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeText, localMediaUrl, readingMinutes, sanitizeArticleHtml } from "./content.ts";

describe("content boundaries", () => {
  it("decodes safe editorial text", () => {
    assert.equal(decodeText("<b>Гайд</b> &laquo;Монах&raquo;&nbsp;2026"), "Гайд «Монах» 2026");
  });

  it("removes scripts, event handlers, ads and unsafe urls", () => {
    const html = sanitizeArticleHtml('<p onclick="bad()">Текст</p><script>bad()</script><div class="ya-ad">ad</div><a href="javascript:bad()">x</a>');
    assert.match(html, /<p>Текст<\/p>/);
    assert.doesNotMatch(html, /script|onclick|javascript|ya-ad|>ad</);
  });

  it("returns a stable minimum reading time", () => {
    assert.equal(readingMinutes("<p>Короткий текст</p>"), 1);
  });

  it("proxies only the public WordPress uploads path", () => {
    assert.match(localMediaUrl("https://hs-manacost.ru/wp-content/uploads/2026/09/cover.jpg"), /^\/api\/media\?url=/);
    assert.equal(localMediaUrl("https://hs-manacost.ru/wp-json/wp/v2/users"), "");
    assert.equal(localMediaUrl("https://example.com/wp-content/uploads/cover.jpg"), "");
  });

  it("preserves rendered WordPress galleries and proxies both thumbnail and full-size media", () => {
    const html = sanitizeArticleHtml(`
      <div class="gallery gallery-columns-2 gallery-size-full">
        <figure class="gallery-item">
          <div class="gallery-icon landscape">
            <a href="https://hs-manacost.ru/wp-content/uploads/2026/09/full.jpg">
              <img src="https://hs-manacost.ru/wp-content/uploads/2026/09/thumb.jpg" srcset="unsafe" alt="Карта">
            </a>
          </div>
          <figcaption class="wp-caption-text gallery-caption">Подпись</figcaption>
        </figure>
      </div>
    `);

    assert.match(html, /class="gallery gallery-columns-2 gallery-size-full"/);
    assert.match(html, /class="gallery-item"/);
    assert.match(html, /href="\/api\/media\?url=/);
    assert.match(html, /src="\/api\/media\?url=/);
    assert.match(html, /gallery-caption">Подпись/);
    assert.doesNotMatch(html, /srcset="unsafe"/);
  });

  it("preserves classic dl/dt/dd WordPress gallery structure", () => {
    const html = sanitizeArticleHtml(`
      <div class="gallery gallery-columns-2">
        <dl class="gallery-item">
          <dt class="gallery-icon">
            <a href="https://hs-manacost.ru/wp-content/uploads/2026/09/full.jpg">
              <img src="https://hs-manacost.ru/wp-content/uploads/2026/09/thumb.jpg" alt="Карта">
            </a>
          </dt>
          <dd class="wp-caption-text gallery-caption">Описание</dd>
        </dl>
        <br style="clear: both">
      </div>
    `);

    assert.match(html, /<dl class="gallery-item">/);
    assert.match(html, /<dt class="gallery-icon">/);
    assert.match(html, /<dd class="wp-caption-text gallery-caption">Описание<\/dd>/);
  });

  it("removes complete and malformed inline VIP shortcode regions", () => {
    const paired = sanitizeArticleHtml("<p>Открыто</p>[panelVIP id=secret]<p>Платный текст</p>[/panelVIP]<p>Финал</p>");
    assert.match(paired, /Открыто/);
    assert.match(paired, /Финал/);
    assert.doesNotMatch(paired, /Платный текст|panelVIP|secret/);

    const unclosed = sanitizeArticleHtml("<p>Открыто</p>[panelVIP]<p>Не должно утечь</p>");
    assert.match(unclosed, /Открыто/);
    assert.doesNotMatch(unclosed, /Не должно утечь|panelVIP/);

    const nested = sanitizeArticleHtml(
      "<p>До</p>[panelVIP]Внешний[panelVIP]Внутренний[/panelVIP]Хвост[/panelVIP]<p>После</p>",
    );
    assert.match(nested, /До/);
    assert.match(nested, /После/);
    assert.doesNotMatch(nested, /Внешний|Внутренний|Хвост|panelVIP/);
  });

  it("converts safe legacy wrappers without exposing shortcode syntax", () => {
    const html = sanitizeArticleHtml(
      "[su_panel]<p>Редакторская заметка про [hs-card id=EDR_979]Древо Древности[/hs-card].</p>[/su_panel]",
    );

    assert.match(html, /class="wp-editorial-panel"/);
    assert.match(html, /class="wp-card-reference">Древо Древности/);
    assert.doesNotMatch(html, /\[(?:\/?su_panel|\/?hs-card)/);
  });

  it("replaces unsupported data widgets with a safe fallback", () => {
    const html = sanitizeArticleHtml(
      "<h3>Колоды</h3>[hs_deck-small id=292635][bg_heroes id=298147 tier=s][voting id=x onclick=bad()]",
    );

    assert.equal((html.match(/class="wp-shortcode-fallback"/g) ?? []).length, 3);
    assert.match(html, /Интерактивный блок доступен в оригинале статьи/);
    assert.doesNotMatch(html, /hs_deck-small|bg_heroes|voting|onclick|bad/);
  });

  it("removes the body of paired unsupported data widgets", () => {
    const html = sanitizeArticleHtml("<p>До</p>[bg_heroes]INTERNAL PAYLOAD[/bg_heroes]<p>После</p>");

    assert.match(html, /До/);
    assert.match(html, /После/);
    assert.doesNotMatch(html, /INTERNAL PAYLOAD|bg_heroes/);
  });

  it("allows observed HTTPS video embeds but rejects insecure and unknown iframe origins", () => {
    const html = sanitizeArticleHtml(`
      <iframe src="https://vkvideo.ru/video_ext.php?id=1" title="VK Video"></iframe>
      <iframe src="http://vkvideo.ru/video_ext.php?id=2"></iframe>
      <iframe src="https://attacker.example/embed"></iframe>
      <iframe src="//www.youtube.com/embed/id"></iframe>
      <iframe src="https://youtube.com:444/embed/id"></iframe>
    `);

    assert.match(html, /https:\/\/vkvideo\.ru\/video_ext\.php\?id=1/);
    assert.match(html, /loading="lazy"/);
    assert.match(html, /referrerpolicy="strict-origin-when-cross-origin"/);
    assert.doesNotMatch(html, /id=2|attacker\.example|\/\/www\.youtube\.com|youtube\.com:444/);
  });
});
