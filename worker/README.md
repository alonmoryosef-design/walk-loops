# שרת ביניים ב-Cloudflare

השרת מעביר בקשות מסלול וחיפוש כתובות ל-OpenRouteService. המפתח נשמר בו ולא בדפדפן, תשובות שחוזרות על עצמן נשמרות בזיכרון, ורק האתר של האפליקציה יכול לפנות אליו.

## התקנה דרך האתר של Cloudflare (בערך 3 דקות)

1. נכנסים ל-https://dash.cloudflare.com, ובתפריט בוחרים **Compute (Workers)** ← **Workers & Pages** ← **Create** ← **Start with Hello World!**.
2. מקלידים שם, למשל `walk-loops-api`, ולוחצים **Deploy**.
3. לוחצים **Edit code**, מוחקים את כל מה שיש בעורך, מדביקים את התוכן של `worker.js` ולוחצים **Deploy**.
4. חוזרים ל-Worker ונכנסים ל-**Settings** ← **Variables and Secrets** ← **Add**. בוחרים Type: **Secret**, Name: `ORS_KEY`, ובשדה Value מדביקים את מפתח OpenRouteService. לוחצים **Deploy**.
5. מעתיקים את הכתובת של ה-Worker, למשל `https://walk-loops-api.<שם>.workers.dev`, ומכניסים אותה ל-`PROXY_URL` בקובץ `config.js`.

## הערות

- אם האתר עובר לכתובת אחרת (דומיין משלך), מוסיפים אותה ל-`ALLOWED_ORIGINS` בראש `worker.js`.
- המסלול החינמי של Workers כולל 100,000 בקשות ביום.
- המכסה של OpenRouteService בחינם: 2,000 מסלולים ו-1,000 חיפושי כתובת ביום. מסלולים שחוזרים על עצמם לא נספרים, כי הם נשמרים בזיכרון.
