const express = require("express");
const app = express();
const multer = require("multer");
require("dotenv").config();
const fs = require("fs");

const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

// Set up Multer storage engine for uploaded files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix =
      Date.now() + "-" + Math.round(Math.random() * 1e9) + ".mp3";
    cb(null, file.fieldname + "-" + uniqueSuffix);
  },
});

// Create Multer instance with specified storage engine and accepted MIME types
const upload = multer({
  storage,
  limits: { fileSize: process.env.MAX_FILE_SIZE || "25MB" },
}).single("file");

/**
 * POST /upload
 * Allows user to upload a mp3 or wav file and creates YouTube assets using OpenAI APIs.
 *
 * @param {Object} req - The request object containing the uploaded file.
 * @param {Object} res - The response object with the created YouTube assets.
 */
const uploadFile = async (req, res) => {
  // Call Multer middleware to handle uploaded file
  upload(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: "File too large" });
    } else if (err) {
      console.error(err);
      return res.status(500).json({ message: "Error uploading file" });
    }

    console.log(`Uploaded ${req.file.filename}`);

    try {
      // Call OpenAI Whisper API for transcription
      const resp = await openai.createTranscription(
        fs.createReadStream(req.file.path),
        "whisper-1"
      );

      // Get transcript from response text
      const transcript = resp.data.text;

      console.log(transcript)

      // Call ChatGPT API with template for creating YouTube assets
      const chatgptResponse = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: `Can you write an eye-catching title, description and AI art prompt for this transcript? \n\nTitle:\nDescription as question:\nPotential AI art prompt from this transcript (using a random lesser-known art period):\n\n${transcript}`,
          },
        ],
        max_tokens: 1000,
      });

      // Extract generated title, description, and AI art prompt from response choices array
      const [generatedText] = chatgptResponse.data.choices.map((choice) =>
        choice.message.content.trim()
      );

      console.log(generatedText)

      const [title, descriptionQuestion, aiArtPrompt] = generatedText
        .split("\n")
        .map((line) => line.slice(line.indexOf(":") + 1).trim());

      // Send back created YouTube assets
      res.status(200).json({
        title,
        description: `${descriptionQuestion} \n\nTranscript:\n${transcript}`,
        aiArtPrompt,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send("Error creating YouTube assets");
    }
  });
};

// Define route for file upload
app.post("/upload", uploadFile);

// Start server on port 3000
app.listen(3000, () => {
  console.log("Server started on port 3000");
});
