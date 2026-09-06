// pages/api/measure-surface.js
import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,PATCH,DELETE,POST,PUT"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { photoBase64, height } = req.body;

    if (!photoBase64 || typeof height !== "number" || height <= 0) {
      return res
        .status(400)
        .json({ error: "Photo (base64) and positive height are required" });
    }

    const cleanBase64 = photoBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

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
      "porte-fenêtre": 1400,
      plomberie: 220,
      électricité: 150,
      radiateur: 420,
      cuisine: 3000,
      sdb: 1400,
      béton: 180,
    };

    const promptText = `Tu es un expert métreur du BTP. À partir d'une photo de chantier et d'une hauteur de référence, tu dois déterminer automatiquement les métrés des éléments visibles.

Hauteur de référence indiquée par l'utilisateur : ${height} m  
(C'est par exemple la hauteur sous plafond ou la hauteur d'un élément visible sur la photo.)

Ta mission :
1. Identifier tous les éléments mesurables pertinents pour des travaux :
   - Murs (peinture, enduit, cloison, revêtement mural, lambris, isolation, etc.)
   - Sols (carrelage, parquet, revêtement de sol, dallage, chape, etc.)
   - Ouvrages (fenêtres, portes, portes-fenêtres, etc.)
   - Autres éléments pertinents (escaliers, façades, etc. si visibles)
2. Pour chaque élément :
   - Donner un libellé clair (ex: "Mur gauche salon", "Sol cuisine", "Fenêtre façade", etc.)
   - Estimer la largeur (en mètres)
   - Estimer la hauteur (en mètres), en utilisant la hauteur de référence ${height} m comme étalon visuel
   - Calculer la surface (largeur × hauteur) en m²
   - Pour les fenêtres/portes, tu peux aussi donner le nombre d'unités si c'est pertinent
   - Donner un niveau de confiance entre 0 et 1
3. Être réaliste et prudent : si une dimension est très incertaine, réduis la confiance. N'invente pas d'éléments clairement invisibles.

Réponds UNIQUEMENT en JSON, sans texte avant ni après, et sans bloc de code Markdown. Le JSON doit respecter strictement ce schéma :

{
  "items": [
    {
      "element": "Mur",
      "description": "Mur gauche du salon",
      "category": "peinture",
      "width": 5.0,
      "height": 2.5,
      "area": 12.5,
      "confidence": 0.85,
      "unit": "m2"
    },
    {
      "element": "Sol",
      "description": "Sol cuisine",
      "category": "carrelage",
      "width": 4.0,
      "height": 3.0,
      "area": 12.0,
      "confidence": 0.8,
      "unit": "m2"
    },
    {
      "element": "Fenêtre",
      "description": "Fenêtre façade salon",
      "category": "fenêtre",
      "width": 1.2,
      "height": 1.3,
      "area": 1.56,
      "confidence": 0.75,
      "unit": "m2",
      "quantity": 1
    }
  ]
}

Règles :
- "category" doit correspondre à un type de travaux (peinture, carrelage, cloison, enduit, revêtement, parquet, lambris, isolation, dallage, fenêtre, porte, porte-fenêtre, plomberie, électricité, radiateur, cuisine, sdb, béton, etc.).
- Si un élément ne correspond à rien de connu, mets "category": "autre".
- Ne mets que les éléments que tu arrives à estimer avec un minimum de confiance (> 0.4).`;

    const message = await client.messages.create({
      model: "claude-opus-4-6", // ou un modèle disponible sur ton compte
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: cleanBase64,
              },
            },
            {
              type: "text",
              text: promptText,
            },
          ],
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    let items = [];

    try {
      const jsonText = responseText
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();

      const parsed = JSON.parse(jsonText);
      items = Array.isArray(parsed.items) ? parsed.items : [];
    } catch (e) {
      console.error("Error parsing JSON from Claude:", e, responseText);
    }

    // Ajout des prix unitaires selon priceDB
    items = items.map((item) => {
      const cat = (item.category || "").toLowerCase();

      let price = 0;
      for (const [key, value] of Object.entries(priceDB)) {
        if (
          cat === key ||
          cat.includes(key) ||
          key.includes(cat.split(" ")[0])
        ) {
          price = value;
          break;
        }
      }

      const area = typeof item.area === "number" ? item.area : 0;
      const quantity = typeof item.quantity === "number" ? item.quantity : 1;

      return {
        element: item.element || "Élément",
        description: item.description || "",
        category: item.category || "autre",
        width: typeof item.width === "number" ? item.width : 0,
        height: typeof item.height === "number" ? item.height : 0,
        area,
        quantity,
        confidence: typeof item.confidence === "number" ? item.confidence : 0,
        unit: item.unit || "m2",
        pricePerUnit: price,
        totalPrice: area * price * (item.unit === "m2" ? 1 : quantity),
      };
    });

    return res.status(200).json({ items });
  } catch (error) {
    console.error("Error in measure-surface:", error);

    return res.status(500).json({
      error: "Internal server error",
      details:
        process.env.NODE_ENV === "development" ? error?.message : undefined,
    });
  }
}
