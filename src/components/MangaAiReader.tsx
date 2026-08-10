"use client";

import {
  CSSProperties,
  FormEvent,
  TouchEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { apiPath } from "@/lib/paths";
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

type PhraseAnalysis = {
  reading: string | null;
  meaning_vi: string;
  kanji: Array<{
    kanji: string;
    meaning_vi: string;
    onyomi?: string | null;
    kunyomi?: string | null;
  }>;
  grammar: string | null;
};

type Message = {
  id: number;
  role: "user" | "assistant";
  text?: string;
  translation?: Translation;
  phraseAnalysis?: {
    context: string;
    phrase: string;
    saved?: boolean;
    value: PhraseAnalysis;
  };
  error?: boolean;
};

type ApiResponse = {
  kind?: "chat" | "translation";
  content?: string | Translation;
  cached?: boolean;
  error?: string;
};

type ImageAiModelOption = {
  label: string;
  model: string;
  provider: "openclaw" | "bedrock";
};

type AiConfigResponse = {
  defaultSelection?: Pick<ImageAiModelOption, "model" | "provider">;
  models?: ImageAiModelOption[];
};

type PhraseResponse = {
  action?: "ask" | "card";
  analysis?: PhraseAnalysis;
  error?: string;
  phrase?: string;
  saved?: boolean;
};

const MIN_IMAGE_SCALE = 1;
const MAX_IMAGE_SCALE = 3;

function touchDistance(event: TouchEvent) {
  const [first, second] = Array.from(event.touches);
  if (!first || !second) return 0;

  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

function clampScale(scale: number) {
  return Math.min(MAX_IMAGE_SCALE, Math.max(MIN_IMAGE_SCALE, scale));
}

const JAPANESE_PARTICLE_PATTERN =
  /(から|まで|より|では|には|とは|って|は|が|を|に|へ|で|と|も|の|や|か|ね|よ|ぞ)/g;
const JAPANESE_PARTICLES = new Set([
  "から",
  "まで",
  "より",
  "では",
  "には",
  "とは",
  "って",
  "は",
  "が",
  "を",
  "に",
  "へ",
  "で",
  "と",
  "も",
  "の",
  "や",
  "か",
  "ね",
  "よ",
  "ぞ",
]);

function splitJapanesePhraseSegments(text: string) {
  return text
    .split(JAPANESE_PARTICLE_PATTERN)
    .filter(Boolean)
    .map((part) => ({
      clickable: Boolean(part.trim()) && !JAPANESE_PARTICLES.has(part),
      text: part,
    }));
}

function normalizePhrase(part: string) {
  return part.trim();
}

function PhraseAnalysisView({
  analysis,
  disabled,
  onCreateCard,
  phrase,
  saved,
}: {
  analysis: PhraseAnalysis;
  disabled?: boolean;
  onCreateCard?: () => void;
  phrase: string;
  saved?: boolean;
}) {
  return (
    <div className={styles.phraseAnalysis}>
      <strong>{phrase}</strong>
      {analysis.reading ? <small>読み方: {analysis.reading}</small> : null}
      <p>意味: {analysis.meaning_vi}</p>
      {analysis.kanji?.length ? (
        <div>
          <span>漢字:</span>
          <ul>
            {analysis.kanji.map((item, index) => (
              <li key={`${item.kanji}-${index}`}>
                {item.kanji}: {item.meaning_vi}
                {item.onyomi || item.kunyomi
                  ? ` (${[item.onyomi, item.kunyomi].filter(Boolean).join(" / ")})`
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {analysis.grammar ? <p>文法: {analysis.grammar}</p> : null}
      {saved ? (
        <em>Flash card saved.</em>
      ) : onCreateCard ? (
        <button
          className={styles.phraseCardButton}
          disabled={disabled}
          onClick={onCreateCard}
          type="button"
        >
          Tạo Card
        </button>
      ) : null}
    </div>
  );
}

function ZoomableMangaImage({
  checked,
  image,
  onToggle,
}: {
  checked: boolean;
  image: MangaImage;
  onToggle: () => void;
}) {
  const [scale, setScale] = useState(MIN_IMAGE_SCALE);
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  const imageStyle = {
    "--image-scale": scale,
  } as CSSProperties;

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;

    pinchRef.current = {
      distance: touchDistance(event),
      scale,
    };
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !pinchRef.current) return;

    event.preventDefault();
    const nextDistance = touchDistance(event);
    if (nextDistance <= 0 || pinchRef.current.distance <= 0) return;

    const nextScale =
      pinchRef.current.scale * (nextDistance / pinchRef.current.distance);
    setScale(clampScale(nextScale));
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) {
      pinchRef.current = null;
    }
  };

  return (
    <div
      className={styles.imageWrap}
      onDoubleClick={() =>
        setScale((current) =>
          current > MIN_IMAGE_SCALE ? MIN_IMAGE_SCALE : MAX_IMAGE_SCALE
        )
      }
      onTouchCancel={handleTouchEnd}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchStart}
      style={imageStyle}
    >
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
          checked ? styles.imagePickerChecked : ""
        }`}
        title="Select image for AI"
      >
        <input
          aria-label={`Select ${image.alt} for AI`}
          checked={checked}
          onChange={onToggle}
          type="checkbox"
        />
        <span />
      </label>
    </div>
  );
}

export default function MangaAiReader({ images }: { images: MangaImage[] }) {
  const [checkedImageId, setCheckedImageId] = useState<string | null>(null);
  const [chatImage, setChatImage] = useState<MangaImage | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phraseLoading, setPhraseLoading] = useState(false);
  const [aiModels, setAiModels] = useState<ImageAiModelOption[]>([
    { label: "OpenClaw - openclaw", model: "openclaw", provider: "openclaw" },
  ]);
  const [selectedAiModel, setSelectedAiModel] = useState(0);
  const [openClawModel, setOpenClawModel] = useState("");
  const [activePhrase, setActivePhrase] = useState<{
    context: string;
    phrase: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const checkedImage =
    images.find((image) => image.id === checkedImageId) ?? null;

  const getSelectedAiRequest = () => {
    const selectedModel = aiModels[selectedAiModel] ?? aiModels[0];
    const customOpenClawModel = openClawModel.trim();

    return {
      provider: selectedModel?.provider,
      ...(selectedModel?.provider === "openclaw"
        ? customOpenClawModel
          ? { model: customOpenClawModel }
          : {}
        : { model: selectedModel?.model }),
    };
  };

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
    let cancelled = false;

    async function loadAiConfig() {
      try {
        const response = await fetch(apiPath("/api/ai/config"), {
          cache: "no-store",
        });
        const result = (await response.json()) as AiConfigResponse;
        if (!response.ok || !result.models?.length || cancelled) return;

        setAiModels(result.models);
        const defaultIndex = result.models.findIndex(
          (option) =>
            option.provider === result.defaultSelection?.provider &&
            option.model === result.defaultSelection?.model
        );
        setSelectedAiModel(defaultIndex >= 0 ? defaultIndex : 0);
      } catch {
        // The OpenClaw fallback remains available if config loading fails.
      }
    }

    void loadAiConfig();
    return () => {
      cancelled = true;
    };
  }, []);

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
      const response = await fetch(apiPath("/api/ai"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          imageId: chatImage.id,
          ...getSelectedAiRequest(),
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

  const requestPhrase = async (action: "ask" | "card") => {
    if (!activePhrase || phraseLoading) return;
    const { context, phrase } = activePhrase;
    await requestPhraseAction(action, phrase, context);
  };

  const requestPhraseAction = async (
    action: "ask" | "card",
    phrase: string,
    context: string
  ) => {
    if (phraseLoading) return;
    setPhraseLoading(true);
    setActivePhrase(null);
    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        role: "user",
        text: `${action === "card" ? "Create flash card" : "Ask AI"}: ${phrase}`,
      },
    ]);

    try {
      const response = await fetch(apiPath("/api/phrases"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          context,
          phrase,
          ...getSelectedAiRequest(),
        }),
      });
      const result = (await response.json()) as PhraseResponse;
      if (!response.ok || result.error || !result.analysis) {
        throw new Error(result.error || "Phrase AI request failed.");
      }
      const analysis = result.analysis;

      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          phraseAnalysis: {
            context,
            phrase: result.phrase || phrase,
            saved: result.saved,
            value: analysis,
          },
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
      setPhraseLoading(false);
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
          <ZoomableMangaImage
            checked={checkedImageId === image.id}
            image={image}
            key={image.id}
            onToggle={() =>
              setCheckedImageId((current) =>
                current === image.id ? null : image.id
              )
            }
          />
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
                          <strong>
                            {splitJapanesePhraseSegments(item.text).map(
                              (segment, phraseIndex) => {
                                if (!segment.clickable) {
                                  return (
                                    <span
                                      className={styles.phrasePlain}
                                      key={`${segment.text}-${phraseIndex}`}
                                    >
                                      {segment.text}
                                    </span>
                                  );
                                }

                                const phrase = normalizePhrase(segment.text);
                                return (
                                <button
                                  className={styles.phraseButton}
                                  key={`${phrase}-${phraseIndex}`}
                                  onClick={() =>
                                    setActivePhrase((current) =>
                                      current?.phrase === phrase &&
                                      current.context === item.text
                                        ? null
                                        : { context: item.text, phrase }
                                    )
                                  }
                                  type="button"
                                >
                                  {segment.text}
                                </button>
                                );
                              }
                            )}
                          </strong>
                          {activePhrase?.context === item.text ? (
                            <div className={styles.phraseMenu}>
                              <button
                                disabled={phraseLoading}
                                onClick={() => void requestPhrase("ask")}
                                type="button"
                              >
                                Hỏi AI
                              </button>
                              <button
                                disabled={phraseLoading}
                                onClick={() => void requestPhrase("card")}
                                type="button"
                              >
                                Tạo Card (AI)
                              </button>
                            </div>
                          ) : null}
                          {item.reading ? <small>{item.reading}</small> : null}
                          <p>{item.meaning_vi}</p>
                          {Number.isFinite(item.confidence) ? (
                            <span className={styles.confidence}>
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
                  ) : message.phraseAnalysis ? (
                    <PhraseAnalysisView
                      analysis={message.phraseAnalysis.value}
                      disabled={phraseLoading}
                      onCreateCard={
                        message.phraseAnalysis.saved
                          ? undefined
                          : () =>
                              void requestPhraseAction(
                                "card",
                                message.phraseAnalysis?.phrase ?? "",
                                message.phraseAnalysis?.context ?? ""
                              )
                      }
                      phrase={message.phraseAnalysis.phrase}
                      saved={message.phraseAnalysis.saved}
                    />
                  ) : (
                    message.text
                  )}
                </div>
              ))}
              {loading || phraseLoading ? (
                <div className={`${styles.message} ${styles.aiMessage}`}>
                  <span className={styles.typing}>AI is thinking</span>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <div className={styles.actions}>
              <label className={styles.modelSelect}>
                <span>AI model</span>
                <select
                  aria-label="AI model"
                  disabled={loading || phraseLoading}
                  onChange={(event) =>
                    setSelectedAiModel(Number(event.target.value))
                  }
                  value={selectedAiModel}
                >
                  {aiModels.map((option, index) => (
                    <option
                      key={`${option.provider}-${option.model}`}
                      value={index}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {aiModels[selectedAiModel]?.provider === "openclaw" ? (
                <label className={styles.modelSelect}>
                  <span>OpenClaw model (optional)</span>
                  <input
                    aria-label="Custom OpenClaw model"
                    disabled={loading || phraseLoading}
                    maxLength={200}
                    onChange={(event) => setOpenClawModel(event.target.value)}
                    placeholder="Leave blank to use OPENCLAW_MODEL"
                    type="text"
                    value={openClawModel}
                  />
                </label>
              ) : null}
              <button
                className={styles.translateButton}
                disabled={loading || phraseLoading}
                onClick={() => void requestAi("translate")}
                type="button"
              >
                Translate image
              </button>
            </div>

            <form className={styles.composer} onSubmit={handleSubmit}>
              <textarea
                aria-label="Message"
                disabled={loading || phraseLoading}
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
              <button disabled={loading || phraseLoading || !input.trim()} type="submit">
                Send
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
