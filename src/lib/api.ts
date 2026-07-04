const API_URL = "http://127.0.0.1:8000";

export async function askAgent(question: string) {
  const response = await fetch(`${API_URL}/api/chat/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question,
    }),
  });

  return await response.json();
}

export async function getState() {
  const response = await fetch(`${API_URL}/api/state`);

  return await response.json();
}

export async function getHistory() {
  const response = await fetch(`${API_URL}/api/history/`);

  return await response.json();
}

export async function getMemory() {
  const response = await fetch(`${API_URL}/api/memory/`);

  return await response.json();
}

export async function recover(sensor: string, failure: string) {
  const response = await fetch(
    `${API_URL}/api/recovery/?sensor=${sensor}&failure=${failure}`
  );

  return await response.json();
}
