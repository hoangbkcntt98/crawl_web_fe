"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import styles from "./MangaAiReader.module.css";

type MangaImage = {
  id: string;
  src: string;
  alt: string;
  eager: boolean;
};

type TranslationItem = {
  text: string;
  reading: string | null;
  meaning_vi: string;
  confidence: number;
};

type Translation = {
  items: TranslationItem[];
  note: string | null;
};

type Message = {
  id: number;
  role: "user" | "assistant";
  text?: string;
  translation?: Translation;
  error?: boolean;
};

type ApiResponse = {
  kind?: "chat" | "translation";
  content?: string | Translation;
  cached?: boolean;
  error?: string;
};

export default function MangaAiReader({ images }: { images: MangaImage[] }) {
  const [checkedImageId, setCheckedImageId] = useState<string | null>(null);
  const [chatImage, setChatImage] = useState<MangaImage | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const checkedImage =
    images.find((image) => image.id === checkedImageId) ?? null;

  const closeChat = () => {
    if (loading) return;
    setChatOpen(false);
    setChatImage(null);
    setMessages([]);
    setInput("");
  };

  const minimizeChat = () => {
    setChatOpen(false);
  };

  const openChat = () => {
    const targetImage = loading && chatImage ? chatImage : checkedImage ?? chatImage;
    if (!targetImage) return;
    if (chatImage?.id !== targetImage.id) {
      setChatImage(targetImage);
      setMessages([]);
      setInput("");
    }
    setChatOpen(true);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && chatOpen) minimizeChat();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chatOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const requestAi = async (
    action: "translate" | "chat",
    message?: string
  ) => {
    if (!chatImage || loading) return;

    const userText = action === "translate" ? "Translate image" : message;
    if (!userText) return;

    setMessages((current) => [
      ...current,
      { id: Date.now(), role: "user", text: userText },
    ]);
    setLoading(true);

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          imageId: chatImage.id,
          ...(action === "chat" ? { message } : {}),
        }),
      });
      const result = (await response.json()) as ApiResponse;

      if (!response.ok || result.error) {
        throw new Error(result.error || "AI request failed.");
      }

      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          ...(result.kind === "translation" &&
          typeof result.content === "object"
            ? { translation: result.content }
            : { text: String(result.content || "") }),
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          text:
            error instanceof Error
              ? error.message
              : "AIサービスでエラーが発生しました。",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || loading) return;
    setInput("");
    void requestAi("chat", message);
  };

  return (
    <>
      <div className={styles.hint}>
        翻訳したい画像を選択して、AIボタンから質問できます。
      </div>
      <div className={styles.pages}>
        {images.map((image) => (
          <div className={styles.imageWrap} key={image.id}>
            <img
              alt={image.alt}
              className={styles.image}
              decoding="async"
              loading={image.eager ? "eager" : "lazy"}
              onContextMenu={(event) => event.preventDefault()}
              onDragStart={(event) => event.preventDefault()}
              src={image.src}
            />
            <label
              className={`${styles.imagePicker} ${
                checkedImageId === image.id ? styles.imagePickerChecked : ""
              }`}
              title="Select image for AI"
            >
              <input
                aria-label={`Select ${image.alt} for AI`}
                checked={checkedImageId === image.id}
                onChange={() =>
                  setCheckedImageId((current) =>
                    current === image.id ? null : image.id
                  )
                }
                type="checkbox"
              />
              <span />
            </label>
          </div>
        ))}
      </div>

      <button
        aria-label={chatOpen ? "AI chat is open" : "Open AI chat"}
        className={`${styles.aiFab} ${loading ? styles.aiFabLoading : ""}`}
        disabled={!checkedImage && !chatImage}
        onClick={openChat}
        title={
          checkedImage || chatImage
            ? "Ask AI"
            : "Select an image before asking AI"
        }
        type="button"
      >
        AI
      </button>

      {chatOpen && chatImage ? (
        <div
          aria-label="Ask AI"
          aria-modal="true"
          className={styles.backdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) minimizeChat();
          }}
          role="dialog"
        >
          <section className={styles.chatPanel}>
            <header className={styles.chatHeader}>
              <img alt="" src={chatImage.src} />
              <div>
                <strong>Ask AI</strong>
                <span>質問はベトナム語で回答されます</span>
              </div>
              <button
                aria-label="Minimize"
                onClick={minimizeChat}
                type="button"
              >
                −
              </button>
              <button
                aria-label="Close"
                disabled={loading}
                onClick={closeChat}
                type="button"
              >
                ×
              </button>
            </header>

            <div className={styles.messages}>
              {messages.length === 0 ? (
                <div className={styles.welcome}>
                  この画像について質問するか、画像内の日本語を翻訳できます。
                </div>
              ) : null}
              {messages.map((message) => (
                <div
                  className={`${styles.message} ${
                    message.role === "user"
                      ? styles.userMessage
                      : styles.aiMessage
                  } ${message.error ? styles.errorMessage : ""}`}
                  key={message.id}
                >
                  {message.translation ? (
                    <div className={styles.translation}>
                      {message.translation.items?.map((item, index) => (
                        <div className={styles.translationItem} key={index}>
                          <strong>{item.text}</strong>
                          {item.reading ? <small>{item.reading}</small> : null}
                          <p>{item.meaning_vi}</p>
                          {Number.isFinite(item.confidence) ? (
                            <span>
                              Confidence:{" "}
                              {Math.round(item.confidence * 100)}%
                            </span>
                          ) : null}
                        </div>
                      ))}
                      {message.translation.note ? (
                        <p className={styles.note}>
                          {message.translation.note}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    message.text
                  )}
                </div>
              ))}
              {loading ? (
                <div className={`${styles.message} ${styles.aiMessage}`}>
                  <span className={styles.typing}>AI is thinking</span>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <div className={styles.actions}>
              <button
                className={styles.translateButton}
                disabled={loading}
                onClick={() => void requestAi("translate")}
                type="button"
              >
                Translate image
              </button>
            </div>

            <form className={styles.composer} onSubmit={handleSubmit}>
              <textarea
                aria-label="Message"
                disabled={loading}
                maxLength={4000}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Ask about this image..."
                rows={1}
                value={input}
              />
              <button disabled={loading || !input.trim()} type="submit">
                Send
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
