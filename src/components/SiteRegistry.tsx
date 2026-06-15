"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./SiteRegistry.module.css";

type Site = {
  site_key: string;
  crawl_status: string;
  crawl_error: string | null;
  last_crawled_at: string | null;
  title_count: number;
};

type FormMode =
  | { type: "register" }
  | { type: "edit"; sourceSiteKey: string }
  | { type: "clone"; sourceSiteKey: string };

type CloneDialog = {
  sourceSiteKey: string;
  siteKey: string;
  error: string;
};

const SITE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/i;

const SAMPLE_CONFIG = `{
  "site_key": "example",
  "base_url": "https://example.com",
  "list": {
    "url": "https://example.com/browse",
    "item_selector": ".manga-item",
    "href": {"selector": "a", "attr": "href", "absolute_url": true},
    "title": {"selector": ".title", "text": true},
    "image": {"selector": "img", "attr": ["data-src", "src"], "absolute_url": true}
  },
  "detail": {
    "chapters": {
      "link_selector": "a.chapter",
      "title_sources": [{"selector": "@self", "text": true, "target": "link"}]
    }
  },
  "reader": {
    "image_selector": ".reader img",
    "image_attrs": ["data-src", "src"]
  }
}`;

export default function SiteRegistry({ initialSites }: { initialSites: Site[] }) {
  const router = useRouter();
  const [configText, setConfigText] = useState(SAMPLE_CONFIG);
  const [sites, setSites] = useState(initialSites);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [crawlingSite, setCrawlingSite] = useState<string | null>(null);
  const [deletingSite, setDeletingSite] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>({ type: "register" });
  const [cloneDialog, setCloneDialog] = useState<CloneDialog | null>(null);
  const configRef = useRef<HTMLTextAreaElement | null>(null);
  const cloneInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!sites.some((site) => site.crawl_status === "crawling")) return;

    const interval = window.setInterval(async () => {
      const response = await fetch("/api/sites", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) {
        setSites(data.sites || []);
        if (
          !(data.sites || []).some(
            (site: Site) => site.crawl_status === "crawling"
          )
        ) {
          setCrawlingSite(null);
          router.refresh();
        }
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [router, sites]);

  useEffect(() => {
    if (!cloneDialog) return;

    cloneInputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCloneDialog(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [cloneDialog]);

  async function registerSite() {
    setSaving(true);
    setMessage("");
    try {
      const config = JSON.parse(configText);
      const editing = formMode.type === "edit";
      const response = await fetch(
        editing
          ? `/api/sites/${encodeURIComponent(formMode.sourceSiteKey)}`
          : formMode.type === "clone"
            ? "/api/sites?createOnly=1"
            : "/api/sites",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Registration failed");

      const sitesResponse = await fetch("/api/sites", { cache: "no-store" });
      const sitesData = await sitesResponse.json();
      setSites(sitesData.sites || []);
      setMessage(
        editing
          ? `${data.site.site_key} を更新しました。`
          : `${data.site.site_key} を登録しました。`
      );
      setFormMode({ type: "register" });
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof SyntaxError
          ? "JSONの形式が正しくありません。"
          : error instanceof Error
            ? error.message
            : "Registration failed"
      );
    } finally {
      setSaving(false);
    }
  }

  async function loadSample() {
    setLoadingSample(true);
    setMessage("");
    try {
      const response = await fetch("/api/sites/sample", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Could not load sample config");
      }

      setConfigText(JSON.stringify(data.config, null, 2));
      setFormMode({ type: "register" });
      setMessage("mangarw.config.json を表示しています。");
      window.requestAnimationFrame(() => configRef.current?.focus());
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load sample config"
      );
    } finally {
      setLoadingSample(false);
    }
  }

  async function crawlSite(siteKey: string) {
    setCrawlingSite(siteKey);
    setMessage("");
    try {
      const response = await fetch(
        `/api/sites/${encodeURIComponent(siteKey)}/crawl`,
        {
          method: "POST",
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Crawl failed");
      setSites((current) =>
        current.map((site) =>
          site.site_key === siteKey
            ? { ...site, crawl_status: "crawling" }
            : site
        )
      );
      setMessage(data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Crawl failed");
    } finally {
      setCrawlingSite(null);
    }
  }

  async function viewConfig(siteKey: string) {
    setMessage("");
    try {
      const response = await fetch(
        `/api/sites/${encodeURIComponent(siteKey)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load config");

      setConfigText(JSON.stringify(data.site.config, null, 2));
      setFormMode({ type: "register" });
      setMessage(`${siteKey} の設定を表示しています。`);
      window.requestAnimationFrame(() => {
        configRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        configRef.current?.focus();
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load config"
      );
    }
  }

  async function prepareConfig(
    siteKey: string,
    mode: "edit" | "clone",
    cloneSiteKey?: string
  ) {
    setMessage("");
    try {
      const response = await fetch(
        `/api/sites/${encodeURIComponent(siteKey)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load config");

      const config = structuredClone(data.site.config) as {
        site_key: string;
      };
      if (mode === "clone") {
        config.site_key = cloneSiteKey ?? "";
      }

      setConfigText(JSON.stringify(config, null, 2));
      setFormMode({ type: mode, sourceSiteKey: siteKey });
      setMessage(
        mode === "edit"
          ? `${siteKey} を編集中です。`
          : `${siteKey} の複製を作成しています。site_keyを確認してください。`
      );
      window.requestAnimationFrame(() => {
        configRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        configRef.current?.focus();
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load config"
      );
    }
  }

  function getSuggestedCloneKey(siteKey: string) {
    const existingKeys = new Set(sites.map((site) => site.site_key));
    let cloneKey = `${siteKey}-copy`;
    let suffix = 2;
    while (existingKeys.has(cloneKey)) {
      cloneKey = `${siteKey}-copy-${suffix}`;
      suffix += 1;
    }
    return cloneKey;
  }

  function openCloneDialog(siteKey: string) {
    setCloneDialog({
      sourceSiteKey: siteKey,
      siteKey: getSuggestedCloneKey(siteKey),
      error: "",
    });
  }

  async function confirmClone() {
    if (!cloneDialog) return;

    const cloneSiteKey = cloneDialog.siteKey.trim();
    if (!SITE_KEY_PATTERN.test(cloneSiteKey)) {
      setCloneDialog({
        ...cloneDialog,
        error:
          "site_keyは2〜64文字の英数字、ハイフン、アンダースコアで入力してください。",
      });
      return;
    }
    if (sites.some((site) => site.site_key === cloneSiteKey)) {
      setCloneDialog({
        ...cloneDialog,
        error: `site_key「${cloneSiteKey}」は既に登録されています。`,
      });
      return;
    }

    const sourceSiteKey = cloneDialog.sourceSiteKey;
    setCloneDialog(null);
    await prepareConfig(sourceSiteKey, "clone", cloneSiteKey);
  }

  function cancelFormMode() {
    setFormMode({ type: "register" });
    setMessage("");
  }

  async function deleteConfig(siteKey: string) {
    const confirmed = window.confirm(
      `${siteKey} の設定と、このサイトのタイトル、チャプター、画像をすべて削除します。続行しますか？`
    );
    if (!confirmed) return;

    setDeletingSite(siteKey);
    setMessage("");
    try {
      const response = await fetch(
        `/api/sites/${encodeURIComponent(siteKey)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: siteKey }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Delete failed");

      setSites((current) =>
        current.filter((site) => site.site_key !== siteKey)
      );
      setMessage(
        `${data.message} Titles: ${data.deleted.titles}, Chapters: ${data.deleted.chapters}, Images: ${data.deleted.images}`
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeletingSite(null);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.heading}>
          <h1>Manga crawler sites</h1>
          <p>サイト設定JSONを登録してからタイトル一覧を開いてください。</p>
        </header>

        <section className={styles.form}>
          <div className={styles.formHeading}>
            <label htmlFor="site-config">Site config JSON</label>
            {formMode.type !== "register" ? (
              <span className={styles.modeBadge}>
                {formMode.type === "edit"
                  ? `Editing: ${formMode.sourceSiteKey}`
                  : `Cloning: ${formMode.sourceSiteKey}`}
              </span>
            ) : null}
          </div>
          <textarea
            id="site-config"
            onChange={(event) => setConfigText(event.target.value)}
            ref={configRef}
            spellCheck={false}
            value={configText}
          />
          <div className={styles.formFooter}>
            <button disabled={saving} onClick={registerSite} type="button">
              {saving
                ? "Saving..."
                : formMode.type === "edit"
                  ? "Update"
                  : formMode.type === "clone"
                    ? "Create clone"
                    : "Regist"}
            </button>
            <button
              disabled={loadingSample}
              onClick={loadSample}
              type="button"
            >
              {loadingSample ? "Loading..." : "Sample"}
            </button>
            {formMode.type !== "register" ? (
              <button onClick={cancelFormMode} type="button">
                Cancel
              </button>
            ) : null}
            {message ? <span className={styles.message}>{message}</span> : null}
          </div>
        </section>

        <section className={styles.sites}>
          {sites.length === 0 ? (
            <div className={styles.empty}>登録済みサイトはありません。</div>
          ) : (
            sites.map((site) => {
              const crawling =
                site.crawl_status === "crawling" ||
                crawlingSite === site.site_key;
              return (
                <article className={styles.siteCard} key={site.site_key}>
                  <div className={styles.siteInfo}>
                    <strong>{site.site_key}</strong>
                    <span>
                      {site.title_count} titles · Status: {site.crawl_status}
                    </span>
                    {site.crawl_error ? (
                      <span className={styles.error}>{site.crawl_error}</span>
                    ) : null}
                  </div>
                  <div className={styles.siteActions}>
                    <button
                      className={styles.configButton}
                      onClick={() => viewConfig(site.site_key)}
                      type="button"
                    >
                      View config
                    </button>
                    <button
                      className={styles.editButton}
                      disabled={crawling}
                      onClick={() => prepareConfig(site.site_key, "edit")}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className={styles.cloneButton}
                      onClick={() => openCloneDialog(site.site_key)}
                      type="button"
                    >
                      Clone
                    </button>
                    <Link
                      className={styles.viewButton}
                      aria-disabled={site.crawl_status === "failed"}
                      href={`/?site=${encodeURIComponent(site.site_key)}`}
                      onClick={(event) => {
                        if (site.crawl_status === "failed") {
                          event.preventDefault();
                        }
                      }}
                    >
                      View titles
                    </Link>
                    <button
                      className={styles.crawlButton}
                      disabled={crawling || deletingSite === site.site_key}
                      onClick={() => crawlSite(site.site_key)}
                      type="button"
                    >
                      {crawling ? "Crawling..." : "Crawl"}
                    </button>
                    <button
                      className={styles.deleteButton}
                      disabled={crawling || deletingSite === site.site_key}
                      onClick={() => deleteConfig(site.site_key)}
                      type="button"
                    >
                      {deletingSite === site.site_key
                        ? "Deleting..."
                        : "Delete"}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
      {cloneDialog ? (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCloneDialog(null);
          }}
        >
          <div
            aria-labelledby="clone-dialog-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
          >
            <h2 id="clone-dialog-title">Clone site config</h2>
            <p>
              <strong>{cloneDialog.sourceSiteKey}</strong> の複製先site_keyを入力
              してください。
            </p>
            <label htmlFor="clone-site-key">New site_key</label>
            <input
              id="clone-site-key"
              onChange={(event) =>
                setCloneDialog({
                  ...cloneDialog,
                  siteKey: event.target.value,
                  error: "",
                })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") void confirmClone();
              }}
              ref={cloneInputRef}
              spellCheck={false}
              value={cloneDialog.siteKey}
            />
            {cloneDialog.error ? (
              <span className={styles.modalError}>{cloneDialog.error}</span>
            ) : null}
            <div className={styles.modalActions}>
              <button onClick={() => setCloneDialog(null)} type="button">
                Cancel
              </button>
              <button onClick={() => void confirmClone()} type="button">
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
