"use client";

import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
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

const LONG_PRESS_MS = 2000;

export default function MangaAiReader({ images }: { images: MangaImage[] }) {
  const [selectedImage, setSelectedImage] = useState<MangaImage | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const cancelLongPress = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setHoldingId(null);
  };

  const startLongPress = (
    event: ReactPointerEvent<HTMLImageElement>,
    image: MangaImage
  ) => {
    if (event.button !== 0) return;
    cancelLongPress();
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    setHoldingId(image.id);
    timerRef.current = setTimeout(() => {
      setSelectedImage(image);
      setMessages([]);
      setInput("");
      setHoldingId(null);
      timerRef.current = null;
      navigator.vibrate?.(40);
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLImageElement>) => {
    const distanceX = Math.abs(event.clientX - pointerStartRef.current.x);
    const distanceY = Math.abs(event.clientY - pointerStartRef.current.y);
    if (distanceX > 10 || distanceY > 10) cancelLongPress();
  };

  const closeChat = () => {
    if (loading) return;
    setSelectedImage(null);
    setMessages([]);
    setInput("");
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeChat();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const requestAi = async (
    action: "translate" | "chat",
    message?: string
  ) => {
    if (!selectedImage || loading) return;

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
          imageId: selectedImage.id,
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
      <div className={styles.hint}>画像を2秒長押ししてAIに質問</div>
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
              onPointerCancel={cancelLongPress}
              onPointerDown={(event) => startLongPress(event, image)}
              onPointerLeave={cancelLongPress}
              onPointerMove={handlePointerMove}
              onPointerUp={cancelLongPress}
              src={image.src}
            />
            {holdingId === image.id ? (
              <div className={styles.holdIndicator}>
                <span />
                Hold to Ask AI
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {selectedImage ? (
        <div
          aria-label="Ask AI"
          aria-modal="true"
          className={styles.backdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeChat();
          }}
          role="dialog"
        >
          <section className={styles.chatPanel}>
            <header className={styles.chatHeader}>
              <img alt="" src={selectedImage.src} />
              <div>
                <strong>Ask AI</strong>
                <span>質問はベトナム語で回答されます</span>
              </div>
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
