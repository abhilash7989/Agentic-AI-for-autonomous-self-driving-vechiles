import { useState } from "react";
import { askAI } from "../services/api";

export default function AIChat() {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!question.trim()) return;

    const userMessage = question;

    setMessages((prev) => [
      ...prev,
      {
        sender: "user",
        text: userMessage,
      },
    ]);

    setQuestion("");
    setLoading(true);

    try {
      const result = await askAI(userMessage);

      let responseText = "";

      // Agent executed tools
      if (result.type === "agent") {
        responseText = result.response
          .map((step) => {
            if (step.status === "success") {
              return `✅ ${step.tool}\n${step.result.message}`;
            }

            return `❌ ${step.tool}\n${step.error}`;
          })
          .join("\n\n");
      }

      // Gemini normal conversation
      else if (result.type === "chat") {
        responseText = result.response;
      }

      else {
        responseText = "Unknown response.";
      }

      setMessages((prev) => [
        ...prev,
        {
          sender: "agent",
          text: responseText,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: "agent",
          text: "Unable to contact AI.",
        },
      ]);
    }

    setLoading(false);
  };

  return (
    <div className="p-4">

      <h2 className="text-xl font-bold mb-4">
        🤖 AI Assistant
      </h2>

      <textarea
        className="w-full p-3 rounded text-black"
        rows={4}
        placeholder="Ask anything..."
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleAsk();
          }
        }}
      />

      <button
        onClick={handleAsk}
        disabled={loading}
        className="mt-4 px-5 py-2 bg-cyan-600 hover:bg-cyan-700 rounded"
      >
        {loading ? "Thinking..." : "Send"}
      </button>

      <div className="mt-6 h-96 overflow-y-auto bg-gray-900 rounded p-4">

        {messages.map((msg, index) => (

          <div
            key={index}
            className={`mb-4 ${
              msg.sender === "user"
                ? "text-right"
                : "text-left"
            }`}
          >

            <div
              className={`inline-block max-w-[80%] px-4 py-3 rounded-lg whitespace-pre-wrap ${
                msg.sender === "user"
                  ? "bg-cyan-600"
                  : "bg-gray-700"
              }`}
            >
              {msg.text}
            </div>

          </div>

        ))}

        {loading && (
          <p className="text-gray-400">
            🤖 Thinking...
          </p>
        )}

      </div>

    </div>
  );
}