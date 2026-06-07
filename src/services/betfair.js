export const getTodayGreyhoundRaces = async () => {
  try {
    const response = await fetch("/.netlify/functions/get-greyhound-races");
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Fetch failed:", error);
    return [];
  }
};
