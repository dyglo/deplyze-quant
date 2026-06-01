/**
 * seo.ts — dependency-free per-route document head management.
 *
 * A tiny imperative alternative to react-helmet: each public page calls
 * `useDocumentHead({...})` to set its <title>, description, canonical, and
 * Open Graph / Twitter tags, plus optional JSON-LD structured data. Tags are
 * upserted on the live document so modern crawlers (which execute JS) index the
 * right metadata per route, and social unfurls resolve. No new dependency, so
 * it works without a package install.
 *
 * SPA model: each route overwrites the shared tags on mount/update. We don't
 * restore previous values on unmount — the next page sets its own, and the
 * static index.html provides sensible defaults for the very first paint.
 */

import { useEffect } from 'react';

const SITE_NAME = 'Deplyze Quant';
const DEFAULT_IMAGE = '/favicon.svg';

export interface DocumentHeadOptions {
  /** Page title; rendered as "<title> — Deplyze Quant" unless it already
   *  contains the site name. Omit on a page that should keep the default. */
  title?: string;
  description?: string;
  /** Path (e.g. "/macro") or absolute URL for the canonical + og:url. Defaults
   *  to the current location. */
  canonicalPath?: string;
  /** Absolute or root-relative image for OG/Twitter cards. */
  image?: string;
  /** og:type — "website" (default) or "article" for briefings. */
  type?: 'website' | 'article';
  /** Optional JSON-LD object injected as application/ld+json. */
  jsonLd?: Record<string, unknown>;
}

function origin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'https://app.deplyze.com';
}

function absUrl(pathOrUrl?: string): string {
  if (!pathOrUrl) return typeof window !== 'undefined' ? window.location.href : origin();
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return origin() + (pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`);
}

function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function useDocumentHead(opts: DocumentHeadOptions): void {
  const { title, description, canonicalPath, image, type = 'website', jsonLd } = opts;
  // Serialize JSON-LD so the effect re-runs only when content actually changes.
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    const fullTitle = title
      ? (title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`)
      : SITE_NAME;
    document.title = fullTitle;

    const url = absUrl(canonicalPath);
    const img = absUrl(image || DEFAULT_IMAGE);

    if (description) {
      upsertMeta('meta[name="description"]', 'name', 'description', description);
      upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
      upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    }
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', type);
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', url);
    upsertMeta('meta[property="og:site_name"]', 'property', 'og:site_name', SITE_NAME);
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', img);
    upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', img);
    upsertLink('canonical', url);

    // Managed JSON-LD block (one per app; replaced on each route).
    const existing = document.head.querySelector('script[data-managed-jsonld="true"]');
    if (jsonLdKey) {
      const script = existing ?? document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.setAttribute('data-managed-jsonld', 'true');
      script.textContent = jsonLdKey;
      if (!existing) document.head.appendChild(script);
    } else if (existing) {
      existing.remove();
    }
  }, [title, description, canonicalPath, image, type, jsonLdKey]);
}

/** Organization JSON-LD for the home page. */
export const ORGANIZATION_JSONLD: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: 'https://app.deplyze.com',
  description: 'AI-native quantitative research and institutional market intelligence platform.',
};
