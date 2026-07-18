/**
 * Frontend snippet for BrightCore's chat widget.
 * Drop this logic into wherever your current chat widget sends
 * messages to your Cloudflare Worker.
 *
 * It shows a small badge like "BrightCore Cybersecurity" above the
 * agent's reply so visitors know which specialist is talking.
 */

const WORKER_URL = "https://your-worker-subdomain.workers.dev"; // <- update this

async function sendMessageToRouter(message, history = []) {
  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

  if (!res.ok) {
    throw new Error("Chat service unavailable");
  }

  return res.json(); // { category, agentLabel, reply }
}

// Example usage inside your existing chat UI code:
//
// const { agentLabel, reply } = await sendMessageToRouter(userMessage, chatHistory);
//
// appendMessageToChat({
//   sender: "assistant",
//   badge: agentLabel,   // e.g. "BrightCore Cybersecurity"
//   text: reply,
// });
//
// chatHistory.push({ role: "user", content: userMessage });
// chatHistory.push({ role: "assistant", content: reply });
