<?php

declare(strict_types=1);

/* ==================================================================
 * EXTRACTION SERVICE
 *
 * Wraps j0k3r/graby and its ~1,960-rule site-config corpus behind a
 * minimal HTTP contract. This is the ONLY PHP in the product.
 *
 * THE SECURITY CONTRACT — read before changing anything here:
 *
 *   1. This service NEVER fetches. Node fetches (SSRF-guarded, with a
 *      pinned IP) and passes the bytes in. Graby is constructed with
 *      content already marked as prefetched, so it makes no outbound
 *      request. In production the container has no egress at all, so
 *      even a compromise cannot turn it into an SSRF proxy.
 *
 *   2. It holds no database connection, no credentials and no tenant
 *      data. It is a pure function from bytes to structure.
 *
 *   3. It is never publicly reachable. Private networking only.
 *
 *   4. Input is hostile by definition — it is arbitrary internet HTML.
 *      Size is capped, libxml entity loading is disabled (XXE), and
 *      every extraction runs inside a try/catch so a malformed
 *      document returns a typed error rather than a 500.
 *
 * The response deliberately contains NO Wallabag or graby types: the
 * Node side depends on this JSON shape, not on graby's internals.
 * ================================================================== */

use Graby\Graby;

require dirname(__DIR__) . '/vendor/autoload.php';

/* XXE: never resolve external entities from untrusted documents.
 * Deprecated as a no-op in PHP 8+ (external entity loading is already
 * off by default) but set explicitly where available so the intent
 * survives a runtime change. */
if (\PHP_VERSION_ID < 80000 && function_exists('libxml_disable_entity_loader')) {
    libxml_disable_entity_loader(true);
}
libxml_use_internal_errors(true);

const MAX_HTML_BYTES = 10 * 1024 * 1024; // mirrors the Node fetch cap
const SERVICE_VERSION = '1.0.0';

function send(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/** Version string recorded on every extraction, so a stored article
 * can always be traced to the exact ruleset that produced it. */
function extractorVersion(): string
{
    static $version = null;
    if ($version !== null) {
        return $version;
    }

    $graby = 'unknown';
    $configs = 'unknown';
    $installed = dirname(__DIR__) . '/vendor/composer/installed.json';
    if (is_readable($installed)) {
        $data = json_decode((string) file_get_contents($installed), true);
        foreach ($data['packages'] ?? [] as $package) {
            if (($package['name'] ?? '') === 'j0k3r/graby') {
                $graby = $package['version'] ?? 'unknown';
            }
            if (($package['name'] ?? '') === 'j0k3r/graby-site-config') {
                $configs = $package['version'] ?? 'unknown';
            }
        }
    }

    return $version = sprintf('graby@%s+siteconfig@%s+svc@%s', $graby, $configs, SERVICE_VERSION);
}

function siteConfigPath(): string
{
    return dirname(__DIR__) . '/vendor/j0k3r/graby-site-config';
}

/* ---- routing ---------------------------------------------------- */

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($path === '/healthz') {
    send(200, [
        'ok' => true,
        'extractorVersion' => extractorVersion(),
        'siteConfigs' => is_dir(siteConfigPath()) ? count(glob(siteConfigPath() . '/*.txt') ?: []) : 0,
    ]);
}

if ($path !== '/extract' || $method !== 'POST') {
    send(404, ['error' => 'not_found']);
}

/* ---- input ------------------------------------------------------- */

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    send(400, ['error' => 'empty_request']);
}
if (strlen($raw) > MAX_HTML_BYTES + 65536) {
    send(413, ['error' => 'too_large']);
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
    send(400, ['error' => 'invalid_json']);
}

$url = $payload['url'] ?? null;
$html = $payload['html'] ?? null;

if (!is_string($url) || $url === '' || !is_string($html) || $html === '') {
    send(400, ['error' => 'url_and_html_required']);
}
if (strlen($html) > MAX_HTML_BYTES) {
    send(413, ['error' => 'too_large']);
}
// Belt and braces: Node validates the URL, but this service must not
// be usable to make graby resolve anything unexpected either.
$scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
if ($scheme !== 'http' && $scheme !== 'https') {
    send(400, ['error' => 'unsupported_scheme']);
}

/* ---- extract ------------------------------------------------------ */

$started = microtime(true);

try {
    $graby = new Graby([
        'debug' => false,
        'error_message' => '[[EXTRACTION_FAILED]]',
        'error_message_title' => '[[NO_TITLE]]',
        'extractor' => [
            'config_builder' => ['site_config' => [siteConfigPath()]],
        ],
    ]);

    // Images keep a no-referrer policy so a reader's IP and referrer
    // never reach the publisher when the article is rendered.
    $graby->toggleImgNoReferrer(true);

    // THE KEY CALL: content is already in hand, so graby performs no
    // network request of its own.
    $graby->setContentAsPrefetched($html);
    $result = $graby->fetchContent($url);
} catch (\Throwable $e) {
    send(422, [
        'error' => 'extraction_error',
        'detail' => substr($e->getMessage(), 0, 300),
        'extractorVersion' => extractorVersion(),
    ]);
}

$contentHtml = (string) ($result['html'] ?? '');
$title = $result['title'] ?? null;

// Graby signals "I could not read this" by returning its configured
// error message rather than by throwing.
$failed = $contentHtml === '' || str_contains($contentHtml, '[[EXTRACTION_FAILED]]');
if ($failed) {
    send(422, [
        'error' => 'extraction_empty',
        'extractorVersion' => extractorVersion(),
        // Metadata may still be usable even when the body is not, so
        // hand it back and let the caller decide.
        'meta' => [
            'title' => ($title === '[[NO_TITLE]]') ? null : $title,
            'language' => $result['language'] ?? null,
            'image' => $result['image'] ?? null,
            'date' => $result['date'] ?? null,
            'authors' => array_values($result['authors'] ?? []),
        ],
    ]);
}

/* Did a site-specific rule actually match, or did this fall through to
 * the readability heuristic? Tracked so the corpus's value is visible
 * rather than assumed. */
$host = strtolower((string) parse_url($url, PHP_URL_HOST));
$host = preg_replace('/^www\./', '', $host) ?? $host;
$siteConfigMatched = false;
foreach ([$host, preg_replace('/^[^.]+\./', '', $host)] as $candidate) {
    if (is_string($candidate) && $candidate !== '' && is_file(siteConfigPath() . '/' . $candidate . '.txt')) {
        $siteConfigMatched = true;
        break;
    }
}

send(200, [
    'title' => ($title === '[[NO_TITLE]]') ? null : $title,
    'html' => $contentHtml,
    'excerpt' => $result['summary'] ?? null,
    'authors' => array_values($result['authors'] ?? []),
    'date' => $result['date'] ?? null,
    'language' => $result['language'] ?? null,
    'image' => $result['image'] ?? null,
    'siteName' => $result['og_site_name'] ?? null,
    'mimetype' => $result['headers']['content-type'] ?? null,
    'siteConfigMatched' => $siteConfigMatched,
    'extractorVersion' => extractorVersion(),
    'durationMs' => (int) round((microtime(true) - $started) * 1000),
]);
