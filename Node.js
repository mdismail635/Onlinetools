const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const sharp = require('sharp');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Endpoint to handle file processing
app.post('/process', upload.array('files'), async (req, res) => {
  const files = req.files;
  const compressionLevel = req.body.compressionLevel;
  const fileFormat = req.body.fileFormat;

  try {
    const processedFiles = await Promise.all(
      files.map(async (file) => {
        const outputPath = path.join(__dirname, 'processed', `${Date.now()}_${file.originalname}`);

        // Handle file conversion and compression
        if (file.mimetype.startsWith('image/')) {
          await sharp(file.path)
            .toFormat(fileFormat === 'jpg' ? 'jpeg' : fileFormat)
            .toFile(outputPath);
        } else if (file.mimetype.startsWith('video/')) {
          await new Promise((resolve, reject) => {
            ffmpeg(file.path)
              .videoBitrate(compressionLevel === 'low' ? '500k' : compressionLevel === 'high' ? '2000k' : '1000k')
              .on('end', resolve)
              .on('error', reject)
              .save(outputPath);
          });
        } else if (file.mimetype === 'application/pdf') {
          const pdfDoc = await PDFDocument.load(fs.readFileSync(file.path));
          fs.writeFileSync(outputPath, await pdfDoc.save());
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const { value } = await mammoth.extractRawText({ path: file.path });
          fs.writeFileSync(outputPath, value);
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
          const workbook = xlsx.readFile(file.path);
          fs.writeFileSync(outputPath, xlsx.write(workbook, { type: 'buffer' }));
        }

        return outputPath;
      })
    );

    // Send the processed files back to the client
    res.json({ downloadUrl: `/download/${path.basename(processedFiles[0])}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Processing failed. Please try again.' });
  }
});

// Serve processed files
app.use('/download', express.static(path.join(__dirname, 'processed')));

// Start the server
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
