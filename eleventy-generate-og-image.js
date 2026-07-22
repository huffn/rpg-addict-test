import fs from "fs";
import sharp from "sharp";
import { createCanvas, loadImage, registerFont } from "canvas";
import * as cheerio from "cheerio";

export default async function(eleventyConfig) {

  eleventyConfig.on('eleventy.after', async ({ dir, results }) => {
    return results.map(async (result) => {
          if (result.outputPath.endsWith('/index.html')) {
            const $ = cheerio.load(result.content);
            const blogTitle = $('body title').text();
            const title = $('head title').text();
            const ogUrl = $('meta[property="og:url"]').attr('content');
            const postDate = $('.post-date').text();
            const content = $('.page-without-title').text();
            const buffer = await createImage({ w: 1200, h: 630 }, blogTitle, title, content, postDate);



            const folder = 'dist' + result.url; // index.html lives here
            await fs.promises.mkdir(folder, { recursive: true });
            await fs.promises.writeFile(folder + 'og.png', buffer);

          }
        });
  });

};

async function createImage(image, blogTitle, title, content, postDate) {
  const snippet = content
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 250);

  const TITLE_AREA = image.h * 0.4; // 252px
  const CONTENT_AREA = image.h * 0.6; // 378px

  const excerpt = content
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) + '...';

  const logoBuffer = await sharp('src/assets/logo.png')
    .resize(400)
    .toBuffer();

  const logo = await loadImage(logoBuffer)

  registerFont('src/assets/InterVariable.ttf', { family: 'Inter' });


  const canvas = createCanvas(image.w, image.h);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#f8f7fb';
  ctx.fillRect(0, 0, image.w, image.h);

  // Accent bar
  ctx.fillStyle = '#35185a';
  ctx.fillRect(0, 0, 12, image.h);

  // Logo
  ctx.drawImage(logo, image.w - 450, image.h - 182, 400, 152);

  // Main title
  const { fontSize, lines } = fitTitle(ctx, title, image.w - 120, 1);
  ctx.font = `bold ${fontSize}px Inter`;

  const titleBottom = wrapText(
    ctx,
    title,
    60,
    150,
    image.w - 110,
    85
  );

  // Date
  ctx.font = '30px Inter';
  ctx.fillStyle = '#6f5aa0';

  ctx.fillText(
    postDate,
    60,
    titleBottom + 40
  );

  // Divider
  ctx.strokeStyle = '#c8c3d5';
  ctx.beginPath();
  ctx.moveTo(60, TITLE_AREA);
  ctx.lineTo(image.w - 60, TITLE_AREA);
  ctx.stroke();

  // Excerpt
  ctx.font = '32px Inter';

  wrapText(
    ctx,
    excerpt,
    60,
    TITLE_AREA + 60,
    image.w - 280,
    45,
    3 // max lines
  );

  const buffer = canvas.toBuffer('image/png');
  return sharp(buffer).png({ quality: 90, compressionLevel: 9 }).toBuffer();


}


function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = Infinity) {
  const words = text.split(' ');
  let line = '';
  let lineCount = 0;

  for (const word of words) {
    const testLine = line + word + ' ';

    if (
      ctx.measureText(testLine).width > maxWidth &&
      line
    ) {
      ctx.fillText(line.trim(), x, y);

      lineCount++;

      if (lineCount >= maxLines) {
        ctx.fillText('...', x, y + lineHeight);
        return y + lineHeight;
      }

      line = word + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }

  ctx.fillText(line.trim(), x, y);
  return y;
}

function getWrappedLines(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];

  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine
      ? `${currentLine} ${word}`
      : word;

    const testWidth = ctx.measureText(testLine).width;

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function fitTitle(ctx, title, maxWidth, maxLines = 2) {
  let fontSize = 72;

  while (fontSize >= 42) {
    ctx.font = `${fontSize}px Inter`;

    const lines = getWrappedLines(ctx, title, maxWidth);

    if (lines.length <= maxLines) {
      return { fontSize, lines };
    }

    fontSize -= 2;
  }

  return {
    fontSize: 42,
    lines: getWrappedLines(ctx, title, maxWidth)
  };
}
