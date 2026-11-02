import "dotenv/config";

/** Asks the running server one question: npm run ask -- "question" [YYYY-MM-DD] */
const [message, today] = process.argv.slice(2);
const baseUrl = process.env.EVAL_BASE_URL ?? "http://localhost:3000";

const response = await fetch(`${baseUrl}/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sessionId: "cli", message: message ?? "", ...(today ? { today } : {}) }),
});
console.log(JSON.stringify(await response.json(), null, 2));
