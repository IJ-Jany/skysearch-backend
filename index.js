
import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());

// Cache token to avoid requesting new one every time
let tokenCache = { token: null, expiry: 0 };

// Get or refresh Amadeus API token
async function getToken() {
  // Use cached token if still valid
  if (tokenCache.token && Date.now() < tokenCache.expiry) {
    return tokenCache.token;
  }

  // Request new token
  const res = await axios.post(
    "https://test.api.amadeus.com/v1/security/oauth2/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.AMADEUS_CLIENT_ID,
      client_secret: process.env.AMADEUS_CLIENT_SECRET
    })
  );

  // Cache the new token
  tokenCache.token = res.data.access_token;
  tokenCache.expiry = Date.now() + res.data.expires_in * 1000;
  
  return tokenCache.token;
}

app.get("/api/flights", async (req, res) => {
  try {
    const token = await getToken();
    const { origin, destination, date, adults = 1 } = req.query;
    
    // Validate required params
    if (!origin || !destination || !date) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const adultsCount = parseInt(adults) || 1;
    const numAdults = Math.max(1, Math.min(9, adultsCount)); // limit between 1-9

    console.log("Fetching flights:", { origin, destination, date, adults: numAdults });
    
    const response = await axios.get(
      "https://test.api.amadeus.com/v2/shopping/flight-offers",
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          originLocationCode: origin,
          destinationLocationCode: destination,
          departureDate: date,
          adults: numAdults,
          max: 20
        }
      }
    );

    // Transform API response to simpler format for frontend
    const flights = response.data.data.map(flight => {
      const firstSegment = flight.itineraries[0].segments[0];
      const departureTime = firstSegment.departure.at.slice(11, 16); // Extract HH:MM
      
      return {
        id: flight.id,
        airline: firstSegment.carrierCode,
        price: Number(flight.price.total),
        stops: flight.itineraries[0].segments.length - 1,
        time: departureTime
      };
    });

    res.json(flights);
  } catch (e) {
    console.error("Error fetching flights:", e.message);
    res.status(500).json({ error: "Failed to fetch flights" });
  }
});

app.listen(5001, () => console.log("Backend running on 5001"));
