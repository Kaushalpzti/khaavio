import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  LoaderCircle,
  MessageCircle,
  Send,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import "./AskKhaavio.css";

const COPY = {
  en: {
    welcome: "Hi! I'm Ask Khaavio. I can help you explore this menu. What are you craving?",
    subtitle: "Your friendly menu assistant",
    placeholder: "Ask about dishes, prices…",
    send: "Send message",
    open: "Open Ask Khaavio chat",
    close: "Close chat",
    quickTitle: "Try asking",
    quickPrompts: ["Suggest something spicy", "Vegetarian options", "Under ₹200"],
    typing: "Finding a helpful answer…",
    unavailable: "Sorry, the assistant is temporarily unavailable. Please try again shortly.",
    add: "Add",
    language: "Reply language",
    offline: "I couldn't connect right now. Please try again in a moment.",
  },
  hi: {
    welcome: "नमस्ते! मैं Ask Khaavio हूँ। इस मेन्यू में आपके लिए क्या अच्छा रहेगा?",
    subtitle: "आपका मेन्यू असिस्टेंट",
    placeholder: "डिश या कीमत के बारे में पूछें…",
    send: "मैसेज भेजें",
    open: "Ask Khaavio चैट खोलें",
    close: "चैट बंद करें",
    quickTitle: "ये पूछकर देखें",
    quickPrompts: ["कुछ spicy सुझाओ", "शाकाहारी विकल्प", "₹200 से कम में"],
    typing: "जवाब ढूँढ रहा हूँ…",
    unavailable: "माफ़ कीजिए, असिस्टेंट अभी उपलब्ध नहीं है। थोड़ी देर बाद कोशिश करें।",
    add: "जोड़ें",
    language: "जवाब की भाषा",
    offline: "अभी कनेक्ट नहीं हो पाया। कृपया थोड़ी देर बाद फिर कोशिश करें।",
  },
  hinglish: {
    welcome: "Hey! Main Ask Khaavio hoon 😊 Menu mein kya try karna chahoge?",
    subtitle: "Tumhara friendly menu assistant",
    placeholder: "Dish, price ya recommendation poochho…",
    send: "Message bhejo",
    open: "Ask Khaavio chat kholo",
    close: "Chat band karo",
    quickTitle: "Yeh poochh sakte ho",
    quickPrompts: ["Kuch spicy suggest karo", "Veg options batao", "₹200 ke andar"],
    typing: "Achha answer dhoondh raha hoon…",
    unavailable: "Sorry bhai, assistant abhi available nahi hai. Thodi der baad try karo.",
    add: "Add karo",
    language: "Reply ki language",
    offline: "Abhi connect nahi ho paya. Ek baar phir try karo.",
  },
};

function formatPrice(price) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(price) || 0);
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getReplyFromError(error, copy) {
  const responseMessage = error?.message || "";
  if (/429|AI_RATE_LIMITED|RATE_LIMITED/i.test(responseMessage)) {
    return copy.unavailable;
  }
  return copy.offline;
}

export default function AskKhaavio({
  restaurant,
  menuItems = [],
  categories = [],
  onAddToCart,
  hasStickyCart = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState("hinglish");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState(() => [{
    id: "greeting",
    role: "assistant",
    content: COPY.hinglish.welcome,
    isGreeting: true,
    suggestedItems: [],
  }]);
  const messageListRef = useRef(null);
  const inputRef = useRef(null);
  const copy = COPY[language];

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  useEffect(() => {
    setMessages((current) => {
      if (current.length === 1 && current[0].isGreeting) {
        return [{ ...current[0], content: copy.welcome }];
      }
      return current;
    });
  }, [copy.welcome]);

  useEffect(() => {
    if (!isOpen || !messageListRef.current) return;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [isOpen, messages, sending]);

  useEffect(() => {
    if (isOpen) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 80);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [isOpen]);

  const preparedMenu = useMemo(
    () => menuItems
      .filter((item) => item && item.name && item.is_available !== false)
      .slice(0, 80)
      .map((item) => ({
        name: item.name,
        description: item.description || "",
        category: categoryById.get(item.category_id) || "Menu",
        price: Number(item.price) || 0,
        available: item.is_available !== false,
      })),
    [menuItems, categoryById],
  );

  async function requestAI(messageText, history) {
    const body = {
      message: messageText,
      language,
      restaurant: {
        name: restaurant?.name || "Restaurant",
        cuisine: restaurant?.restaurant_type || "",
      },
      menuItems: preparedMenu,
      history,
    };

    // The optional local endpoint is only for an explicitly opted-in Vite dev session.
    // Without VITE_KHAAVIO_AI_CHAT_USE_LOCAL=true, use the deployed Supabase Edge Function
    // even if an old .env.local still contains VITE_KHAAVIO_AI_CHAT_URL=http://localhost:8000.
    const useLocalEndpoint =
      import.meta.env.DEV &&
      import.meta.env.VITE_KHAAVIO_AI_CHAT_USE_LOCAL === "true";
    const localEndpoint = useLocalEndpoint
      ? import.meta.env.VITE_KHAAVIO_AI_CHAT_URL?.trim()
      : "";
    if (localEndpoint) {
      const response = await fetch(localEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || data?.error || `Request failed (${response.status})`);
      }
      return data;
    }

    const { data, error } = await supabase.functions.invoke("khaavio-ai-chat", {
      body,
    });

    if (error) {
      let message = error.message || "AI request failed";
      try {
        const context = "context" in error ? error.context : undefined;
        if (context instanceof Response) {
          const details = await context.clone().json();
          message = details?.message || details?.error || message;
        }
      } catch {
        // The Supabase error may not contain a readable JSON body.
      }
      throw new Error(message);
    }

    return data;
  }

  async function sendMessage(optionalText) {
    const text = (optionalText ?? draft).trim();
    if (!text || sending || text.length > 500) return;

    const userMessage = {
      id: makeId(),
      role: "user",
      content: text,
      suggestedItems: [],
    };
    const priorMessages = messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.content }));

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setSending(true);

    try {
      const result = await requestAI(text, priorMessages);
      const reply = typeof result?.reply === "string" ? result.reply.trim() : "";
      if (!reply) throw new Error("The assistant returned an empty reply");

      const normalizedReply = reply.toLocaleLowerCase();
      const suggestions = menuItems
        .filter((item) => item && item.name && item.is_available !== false)
        .filter((item) => {
          const name = String(item.name).trim().toLocaleLowerCase();
          return name.length >= 3 && normalizedReply.includes(name);
        })
        .slice(0, 3);

      setMessages((current) => [...current, {
        id: makeId(),
        role: "assistant",
        content: reply,
        suggestedItems: suggestions,
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: makeId(),
        role: "assistant",
        content: getReplyFromError(error, copy),
        suggestedItems: [],
        isError: true,
      }]);
    } finally {
      setSending(false);
    }
  }

  function handleLanguageChange(event) {
    const nextLanguage = event.target.value;
    if (!Object.prototype.hasOwnProperty.call(COPY, nextLanguage) || nextLanguage === language) {
      return;
    }

    // Start a clean thread so replies from the previous language do not bias the model.
    setLanguage(nextLanguage);
    setDraft("");
    setMessages([{
      id: makeId(),
      role: "assistant",
      content: COPY[nextLanguage].welcome,
      isGreeting: true,
      suggestedItems: [],
    }]);
  }

  function handleSubmit(event) {
    event.preventDefault();
    void sendMessage();
  }

  return (
    <div className={`ask-khaavio-root ${hasStickyCart ? "is-raised" : ""}`}>
      {isOpen && (
        <section
          className="ask-khaavio-panel"
          role="dialog"
          aria-label="Ask Khaavio AI menu assistant"
          aria-modal="false"
        >
          <header className="ask-khaavio-header">
            <div className="ask-khaavio-avatar" aria-hidden="true">
              <Bot size={21} />
              <span />
            </div>
            <div className="ask-khaavio-header-copy">
              <strong>Ask Khaavio</strong>
              <small>{copy.subtitle}</small>
            </div>
            <label className="ask-khaavio-language">
              <span className="sr-only">{copy.language}</span>
              <select
                value={language}
                onChange={handleLanguageChange}
                disabled={sending}
                aria-label={copy.language}
              >
                <option value="en">English</option>
                <option value="hi">हिंदी</option>
                <option value="hinglish">Hinglish</option>
              </select>
              <ChevronDown size={13} aria-hidden="true" />
            </label>
            <button
              type="button"
              className="ask-khaavio-close"
              onClick={() => setIsOpen(false)}
              aria-label={copy.close}
            >
              <X size={18} />
            </button>
          </header>

          <div className="ask-khaavio-context">
            <Utensils size={14} aria-hidden="true" />
            <span>{restaurant?.name || "Restaurant menu"}</span>
            <span className="ask-khaavio-context-dot" />
            <span>{preparedMenu.length} {language === "hi" ? "डिश" : language === "en" ? "dishes" : "dishes"}</span>
          </div>

          <div className="ask-khaavio-messages" ref={messageListRef} aria-live="polite">
            {messages.map((message) => (
              <div
                className={`ask-khaavio-message-row ${message.role === "user" ? "is-user" : "is-assistant"}`}
                key={message.id}
              >
                {message.role === "assistant" && (
                  <span className="ask-khaavio-mini-avatar" aria-hidden="true">
                    <Sparkles size={13} />
                  </span>
                )}
                <div className={`ask-khaavio-bubble ${message.isError ? "has-error" : ""}`}>
                  <p>{message.content}</p>
                  {message.suggestedItems?.length > 0 && (
                    <div className="ask-khaavio-suggestions">
                      {message.suggestedItems.map((item) => (
                        <div className="ask-khaavio-suggestion" key={item.id}>
                          <div className="ask-khaavio-suggestion-info">
                            <strong>{item.name}</strong>
                            <small>{formatPrice(item.price)}</small>
                          </div>
                          <button
                            type="button"
                            onClick={() => onAddToCart?.(item)}
                            aria-label={`${copy.add}: ${item.name}`}
                          >
                            {copy.add}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="ask-khaavio-message-row is-assistant">
                <span className="ask-khaavio-mini-avatar" aria-hidden="true">
                  <Sparkles size={13} />
                </span>
                <div className="ask-khaavio-bubble ask-khaavio-typing">
                  <LoaderCircle size={15} className="ask-khaavio-spin" />
                  <span>{copy.typing}</span>
                </div>
              </div>
            )}
          </div>

          {messages.length === 1 && !sending && (
            <div className="ask-khaavio-quick-prompts">
              <span>{copy.quickTitle}</span>
              <div>
                {copy.quickPrompts.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => void sendMessage(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form className="ask-khaavio-composer" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 500))}
              placeholder={copy.placeholder}
              aria-label={copy.placeholder}
              maxLength={500}
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              aria-label={copy.send}
              title={copy.send}
            >
              {sending ? <LoaderCircle size={17} className="ask-khaavio-spin" /> : <Send size={17} />}
            </button>
          </form>
          <div className="ask-khaavio-footer-note">
            <Sparkles size={11} />
            <span>{language === "hi" ? "मेन्यू पर आधारित सुझाव · एलर्जी की जानकारी स्टाफ से पुष्टि करें" : language === "en" ? "Menu-based suggestions · Confirm allergen details with staff" : "Menu ke basis par suggestions · Allergy details staff se confirm karein"}</span>
          </div>
        </section>
      )}

      {!isOpen && (
        <button
          type="button"
          className="ask-khaavio-launcher"
          onClick={() => setIsOpen(true)}
          aria-expanded={false}
          aria-label={copy.open}
        >
          <MessageCircle size={18} />
          <span>Ask Khaavio</span>
          <span className="ask-khaavio-launcher-sparkle"><Sparkles size={11} /></span>
        </button>
      )}
    </div>
  );
}
