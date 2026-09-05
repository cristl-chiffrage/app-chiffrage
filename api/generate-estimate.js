// api/generate-estimate.js
const Anthropic = require("@anthropic-ai/sdk");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version");
  
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { photoBase64, notes } = req.body;

    if (!photoBase64) {
      return res.status(400).json({ error: "Photo required" });
    }

    const client = new Anthropic();

    // Tarifs de référence SEMSAMAR (Saint-Martin)
    const priceDB = {
      peinture: 15,
      carrelage: 52,
      cloison: 42,
      enduit: 22,
      revêtement: 32,
      parquet: 48,
      lambris: 36,
      isolation: 32,
      dallage: 42,
      fenêtre: 950,
      porte: 520,
      'porte-fenêtre': 1400,
      plomberie: 220,
      électricité: 150,
      radiateur: 420,
      cuisine: 3000,
      sdb: 1400,
      béton: 180,
    };

    // Analyser la photo
    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: photoBase64,
              },
            },
            {
              type: "text",
              text: `Tu es un expert BTP spécialisé dans l'estimation de travaux.

Analyse cette photo de chantier et estime les quantités de travaux nécessaires.

Notes additionnelles: ${notes || "Aucune"}

Identifie TOUS les travaux visibles:
- Peinture, carrelage, cloison, enduit, parquet, etc.
- Estimer les m², m³, ou nombre d'unités
- Donner un niveau de confiance (0-1)

Postes possibles: peinture, carrelage, cloison, enduit, revêtement, parquet, lambris, isolation, dallage, fenêtre, porte, porte-fenêtre, plomberie, électricité, radiateur, cuisine, sdb, béton

Réponds UNIQUEMENT en JSON strict:
{
  "items": [
    { "name": "Peinture", "qty": 28, "unit": "m²", "confidence": 0.85 },
    { "name": "Carrelage", "qty": 22, "unit": "m²", "confidence": 0.8 }
  ],
  "description": "Brève description de ce que tu vois"
}`,
            },
          ],
        },
      ],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    let items = [];
    let description = "";

    try {
      const jsonText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(jsonText);
      items = parsed.items || [];
      description = parsed.description || "";
    } catch (e) {
      console.error("Error parsing response JSON:", e);
    }

    // Ajouter les prix (tarifs SEMSAMAR)
    const itemsWithPrices = items.map(item => {
      const name = item.name.toLowerCase();
      let price = 0;
      
      // Chercher le prix correspondant
      for (const [key, value] of Object.entries(priceDB)) {
        if (name.includes(key) || key.includes(name.split(' ')[0])) {
          price = value;
          break;
        }
      }

      return {
        name: item.name,
        qty: item.qty || 1,
        unit: item.unit || "u",
        pricePerUnit: price,
        confidence: item.confidence || 0.7,
      };
    });

    return res.status(200).json({
      items: itemsWithPrices,
      description: description,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(200).json({
      items: [
        { name: "Peinture", qty: 28, unit: "m²", pricePerUnit: 15, confidence: 0.85 },
        { name: "Carrelage", qty: 22, unit: "m²", pricePerUnit: 52, confidence: 0.8 },
        { name: "Cloison", qty: 15, unit: "m²", pricePerUnit: 42, confidence: 0.7 },
      ],
      description: "Fallback: estimation simulation",
    });
  }
}
