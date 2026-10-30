import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const projectRoot = new URL("../",
    import.meta.url);
const readRoot = (path) => readFileSync(new URL(path, projectRoot), "utf8");

test("robots.txt points crawlers to the Khaavio sitemap", () => {
    const robots = readRoot("public/robots.txt");
    assert.match(robots, /User-agent:\s*\*/i);
    assert.match(robots, /Sitemap:\s*https:\/\/khaavio\.in\/sitemap\.xml/i);
});

test("sitemap contains only public canonical marketing and legal pages", () => {
    const sitemap = readRoot("public/sitemap.xml");
    assert.match(sitemap, /https:\/\/khaavio\.in\//);
    assert.match(sitemap, /https:\/\/khaavio\.in\/about/);
    assert.match(sitemap, /https:\/\/khaavio\.in\/privacy/);
    assert.match(sitemap, /https:\/\/khaavio\.in\/terms/);
    assert.match(sitemap, /https:\/\/khaavio\.in\/refund-policy/);
    assert.doesNotMatch(sitemap, /\/dashboard|\/login|\/signup|\/track\//);
});

test("HTML includes canonical, description, social preview and software schema", () => {
    const html = readRoot("index.html");
    assert.match(html, /rel="canonical" href="https:\/\/khaavio\.in\/"/);
    assert.match(html, /name="description"/);
    assert.match(html, /property="og:image" content="https:\/\/khaavio\.in\/khaavio-social-preview\.png"/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /"@type": "SoftwareApplication"/);
    assert.ok(existsSync(new URL("../public/khaavio-social-preview.png",
        import.meta.url)));
});

test("application routes and footer expose all legal pages", () => {
    const app = readRoot("src/App.jsx");
    const home = readRoot("src/pages/Home.jsx");
    const auth = readRoot("src/pages/Auth.jsx");
    for (const route of["/privacy", "/terms", "/refund-policy"]) {
        assert.ok(app.includes(`path="${route}"`), `Missing route ${route}`);
        assert.ok(home.includes(`to="${route}"`), `Missing footer link ${route}`);
        assert.ok(auth.includes(`to="${route}"`), `Missing auth legal link ${route}`);
    }
    assert.match(app, /path="\/contact" element=\{<Contact \/>\}/);
    assert.match(app, /<SeoManager\s*\/>/);
});

test("About page has a public route, metadata and homepage quick link", () => {
    const app = readRoot("src/App.jsx");
    const home = readRoot("src/pages/Home.jsx");
    const about = readRoot("src/pages/About.jsx");
    const seo = readRoot("src/lib/seoMetadata.js");
    assert.ok(app.includes('path="/about"'));
    assert.ok(home.includes('to="/about">About Khaavio</Link>'));
    assert.match(about, /Better table service/);
    assert.match(about, /restaurant/i);
    assert.match(seo, /"\/about":\s*\{/);
    assert.match(seo, /About Khaavio \| Restaurant QR Ordering & Operations/);
});

test("legal policies are reviewed against current Indian privacy and consumer grievance requirements", () => {
    const legal = readRoot("src/pages/LegalPage.jsx");
    assert.match(legal, /29 October 2026/);
    assert.match(legal, /Digital Personal Data Protection Act, 2023/);
    assert.match(legal, /Digital Personal Data Protection Rules, 2025/);
    assert.match(legal, /48 hours/);
    assert.match(legal, /30 days/);
    assert.match(legal, /statutory right or remedy/);
});

test("operator identity and grievance contact appear on legal pages but not the homepage", () => {
    const legal = readRoot("src/pages/LegalPage.jsx");
    const home = readRoot("src/pages/Home.jsx");
    for (const text of[
            "Kaushal Kumar",
            "Patna, Bihar – 800011, India",
            "Grievance Officer",
            "+91 9471640485",
            "kaushalpzti@gmail.com",
            "48 hours",
            "30 days",
        ]) {
        assert.ok(legal.includes(text), `legal pages should show ${text}`);
    }
    assert.ok(legal.includes('const OPERATOR_PHONE = "+919471640485";'));
    assert.ok(legal.includes('href={`tel:${OPERATOR_PHONE}`}'));
    assert.match(legal, /href=\{`mailto:\$\{GRIEVANCE_EMAIL\}`\}/);
    assert.doesNotMatch(home, /kh-footer-operator|Kaushal Kumar|Patna, Bihar|Grievance Officer|tel:\+919471640485|mailto:kaushalpzti@gmail\.com/);
});

test("redesigned homepage exposes vector social links, product sections and responsive motion", () => {
    const home = readRoot("src/pages/Home.jsx");
    const styles = readRoot("src/pages/Home.css");
    assert.match(home, /FOLLOW KHAAVIO/);
    assert.match(home, /function InstagramBrandIcon/);
    assert.match(home, /<InstagramBrandIcon size=\{18\} \/>/);
    assert.match(home, /MessageCircle size=\{18\}/);
    assert.match(home, /https:\/\/www\.instagram\.com\/khaavio\//);
    assert.match(home, /const WHATSAPP_NUMBER =\s*"917324883263"/);
    assert.match(home, /href=\{`https:\/\/wa\.me\/\$\{WHATSAPP_NUMBER\}`\}/);
    assert.match(home, /id="features"/);
    assert.match(home, /id="how-it-works"/);
    assert.match(home, /id="book-demo"/);
    assert.match(styles, /@keyframes kh2-laptop-float/);
    assert.match(styles, /\.kh2-reveal\.is-visible/);
    assert.match(styles, /@media \(max-width: 620px\)/);
});

test("route navigation resets scroll to the top before paint", () => {
    const app = readRoot("src/App.jsx");
    assert.match(app, /function ScrollToTop\(\)/);
    assert.match(app, /useLayoutEffect\(\(\) => \{[\s\S]*?window\.scrollTo\(\{ top: 0, left: 0, behavior: "instant" \}\);[\s\S]*?\}, \[pathname, hash\]\);/);
    assert.match(app, /if \(hash\) return;/);
    assert.match(app, /<ScrollToTop\s*\/>/);
});

test("legal policies cover privacy handling, subscription terms and refund requests", () => {
    const legal = readRoot("src/pages/LegalPage.jsx");
    assert.match(legal, /Information we may handle/);
    assert.match(legal, /manual subscription payment/);
    assert.match(legal, /7-day free trial/);
    assert.match(legal, /duplicate payment/);
    assert.match(legal, /khaavioqr@gmail\.com/);
    assert.match(legal, /917324883263/);
});