/**
 * Generate OG Images using Satori
 * This script generates 1200x630 JPEG images:
 * - Co-located with blog posts and raw notes (og.jpeg in post folder)
 * - In public/img/og/ for standalone pages ([slug].jpeg)
 * Skips posts/pages that already have og.png, og.jpeg, or og.jpg
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Configuration
const CACHE_FILE = path.join(rootDir, '.og-cache.json');
const BLOG_DIR = path.join(rootDir, 'content', 'blog');
const RAW_DIR = path.join(rootDir, 'content', 'raw');
const CONTENT_DIR = path.join(rootDir, 'content');
const PAGES_OG_DIR = path.join(rootDir, 'public', 'img', 'og');
const PHOTO_PATH = path.join(rootDir, 'public', 'img', 'deepakness-new.jpg');

// Pages to skip (feeds, sitemaps, error pages, data files)
const SKIP_PAGES = [
  'index.njk', // Homepage handled separately
  'feed.md',
  'sitemap.xml.njk',
  'search-index.njk',
  'raw-notes.xml.njk',
  '404.md',
  'webmention.md',
];

// Homepage config (title/description from _includes/layouts/home.njk)
const HOMEPAGE = {
  slug: 'home',
  title: 'An Internet Generalist',
  description: 'An internet generalist exploring the edges of AI, tech, marketing, and more.',
  layoutPath: path.join(rootDir, '_includes', 'layouts', 'home.njk'),
};

// Load fonts
const fontRegular = fs.readFileSync(path.join(rootDir, 'public', 'fonts', 'HelveticaNeueRoman.otf'));
const fontBold = fs.readFileSync(path.join(rootDir, 'public', 'fonts', 'HelveticaNeueBold.otf'));

// Load and encode photo as base64
const photoBuffer = fs.readFileSync(PHOTO_PATH);
const photoBase64 = `data:image/jpeg;base64,${photoBuffer.toString('base64')}`;

// Load or create cache
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch (e) {
    console.log('Cache file not found or invalid, starting fresh');
  }
  return {};
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// Generate MD5 hash for content
function generateHash(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

// Check if folder already has an OG image
function hasExistingOgImage(folderPath) {
  const ogFiles = ['og.png', 'og.jpeg', 'og.jpg'];
  return ogFiles.some(file => fs.existsSync(path.join(folderPath, file)));
}

// Check if post has image frontmatter (custom OG image)
function hasImageFrontmatter(frontmatter) {
  return frontmatter && frontmatter.image && frontmatter.image.length > 0;
}

// Parse frontmatter from markdown file
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);

  if (!match) return null;

  const frontmatter = {};
  const lines = match[1].split('\n');
  let currentKey = null;

  for (const line of lines) {
    // Check for array items
    if (line.startsWith('- ') && currentKey) {
      if (!Array.isArray(frontmatter[currentKey])) {
        frontmatter[currentKey] = [];
      }
      frontmatter[currentKey].push(line.slice(2).trim());
      continue;
    }

    // Check for key-value pairs
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      currentKey = key;
      frontmatter[key] = value || null;
    }
  }

  return frontmatter;
}

// Get all posts from a directory
function getPosts(directory, collection) {
  const posts = [];

  if (!fs.existsSync(directory)) {
    return posts;
  }

  const items = fs.readdirSync(directory, { withFileTypes: true });

  for (const item of items) {
    if (item.isDirectory()) {
      const folderPath = path.join(directory, item.name);
      const indexPath = path.join(folderPath, 'index.md');

      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath, 'utf-8');
        const frontmatter = parseFrontmatter(content);

        if (frontmatter) {
          posts.push({
            slug: item.name,
            folderPath,
            collection,
            title: frontmatter.title || item.name,
            description: frontmatter.description || '',
            hasExistingOg: hasExistingOgImage(folderPath),
            hasCustomImage: hasImageFrontmatter(frontmatter),
            contentHash: generateHash(frontmatter.title + (frontmatter.description || ''))
          });
        }
      }
    }
  }

  return posts;
}

// Get homepage as a special case
function getHomepage() {
  const ogPath = path.join(PAGES_OG_DIR, `${HOMEPAGE.slug}.jpeg`);
  const hasExistingOg = fs.existsSync(ogPath);

  // Check if layout already has image frontmatter
  let hasCustomImage = false;
  if (fs.existsSync(HOMEPAGE.layoutPath)) {
    const content = fs.readFileSync(HOMEPAGE.layoutPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    hasCustomImage = hasImageFrontmatter(frontmatter);
  }

  return {
    slug: HOMEPAGE.slug,
    filePath: HOMEPAGE.layoutPath,
    collection: 'pages',
    title: HOMEPAGE.title,
    description: HOMEPAGE.description,
    hasExistingOg,
    hasCustomImage,
    contentHash: generateHash(HOMEPAGE.title + HOMEPAGE.description)
  };
}

// Get standalone pages from content directory
function getPages() {
  const pages = [];

  if (!fs.existsSync(CONTENT_DIR)) {
    return pages;
  }

  const items = fs.readdirSync(CONTENT_DIR, { withFileTypes: true });

  for (const item of items) {
    // Only process files (not directories)
    if (!item.isFile()) continue;

    const fileName = item.name;

    // Skip files in SKIP_PAGES list
    if (SKIP_PAGES.includes(fileName)) continue;

    // Only process .njk and .md files
    if (!fileName.endsWith('.njk') && !fileName.endsWith('.md')) continue;

    const filePath = path.join(CONTENT_DIR, fileName);
    const content = fs.readFileSync(filePath, 'utf-8');
    const frontmatter = parseFrontmatter(content);

    // Skip files without frontmatter or without title
    if (!frontmatter || !frontmatter.title) continue;

    // Get slug from filename (remove extension)
    const slug = fileName.replace(/\.(njk|md)$/, '');

    // Check if OG image already exists in public/img/og/
    const ogPath = path.join(PAGES_OG_DIR, `${slug}.jpeg`);
    const hasExistingOg = fs.existsSync(ogPath);

    pages.push({
      slug,
      filePath,
      collection: 'pages',
      title: frontmatter.title,
      description: frontmatter.description || '',
      hasExistingOg,
      hasCustomImage: hasImageFrontmatter(frontmatter),
      contentHash: generateHash(frontmatter.title + (frontmatter.description || ''))
    });
  }

  return pages;
}

// Simple wireframe globe icon (circle + meridian + equator)

// Accent color
const accentColor = '#3364ff';

// Generate OG image SVG using Satori
async function generateOgSvg(title, description) {
  // Use full title and description
  const displayTitle = title;
  const displayDesc = description;

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          fontFamily: 'Helvetica Neue',
          position: 'relative',
        },
        children: [
          // Background grid pattern overlay
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: 0.05,
                backgroundImage: `linear-gradient(to right, ${accentColor} 1px, transparent 1px), linear-gradient(to bottom, ${accentColor} 1px, transparent 1px)`,
                backgroundSize: '40px 40px',
              },
            },
          },
          // Blue accent bar at top
          {
            type: 'div',
            props: {
              style: {
                width: '100%',
                height: '12px',
                backgroundColor: accentColor,
              },
            },
          },
          // Content area
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                flex: 1,
                padding: '80px 128px',
              },
              children: [
                // Main content - Title and description centered
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      flex: 1,
                    },
                    children: [
                      // Title
                      {
                        type: 'div',
                        props: {
                          style: {
                            fontSize: '64px',
                            fontWeight: 700,
                            color: '#0f172a',
                            lineHeight: 1.1,
                            letterSpacing: '-2px',
                            marginBottom: '32px',
                          },
                          children: displayTitle,
                        },
                      },
                      // Description
                      description ? {
                        type: 'div',
                        props: {
                          style: {
                            fontSize: '32px',
                            fontWeight: 500,
                            color: '#64748b',
                            lineHeight: 1.4,
                          },
                          children: displayDesc,
                        },
                      } : null,
                    ].filter(Boolean),
                  },
                },
                // Footer with author and URL
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid #f1f5f9',
                      paddingTop: '40px',
                      marginTop: '40px',
                    },
                    children: [
                      // Author section
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '24px',
                          },
                          children: [
                            // Photo container with accent dot
                            {
                              type: 'div',
                              props: {
                                style: {
                                  position: 'relative',
                                  display: 'flex',
                                },
                                children: [
                                  // Photo with border
                                  {
                                    type: 'img',
                                    props: {
                                      src: photoBase64,
                                      width: 80,
                                      height: 80,
                                      style: {
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        border: '4px solid #ffffff',
                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                                      },
                                    },
                                  },
                                  // Accent dot
                                  {
                                    type: 'div',
                                    props: {
                                      style: {
                                        position: 'absolute',
                                        bottom: '4px',
                                        right: '4px',
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '50%',
                                        backgroundColor: accentColor,
                                        border: '3px solid #ffffff',
                                      },
                                    },
                                  },
                                ],
                              },
                            },
                            // Name only
                            {
                              type: 'div',
                              props: {
                                style: {
                                  fontSize: '28px',
                                  fontWeight: 700,
                                  color: '#1e293b',
                                },
                                children: 'DeepakNess',
                              },
                            },
                          ],
                        },
                      },
                      // Website URL with globe icon
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                          },
                          children: [
                            // Simple wireframe globe icon
                            {
                              type: 'svg',
                              props: {
                                width: 32,
                                height: 32,
                                viewBox: '0 0 24 24',
                                fill: 'none',
                                children: [
                                  // Outer circle
                                  {
                                    type: 'circle',
                                    props: {
                                      cx: 12,
                                      cy: 12,
                                      r: 10,
                                      stroke: '#94a3b8',
                                      strokeWidth: 2,
                                    },
                                  },
                                  // Vertical meridian (ellipse)
                                  {
                                    type: 'ellipse',
                                    props: {
                                      cx: 12,
                                      cy: 12,
                                      rx: 4,
                                      ry: 10,
                                      stroke: '#94a3b8',
                                      strokeWidth: 2,
                                    },
                                  },
                                  // Horizontal equator
                                  {
                                    type: 'path',
                                    props: {
                                      d: 'M2 12h20',
                                      stroke: '#94a3b8',
                                      strokeWidth: 2,
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              type: 'div',
                              props: {
                                style: {
                                  fontSize: '26px',
                                  fontWeight: 600,
                                  color: '#475569',
                                  letterSpacing: '0.5px',
                                },
                                children: 'deepakness.com',
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Helvetica Neue',
          data: fontRegular,
          weight: 400,
          style: 'normal',
        },
        {
          name: 'Helvetica Neue',
          data: fontRegular,
          weight: 500,
          style: 'normal',
        },
        {
          name: 'Helvetica Neue',
          data: fontBold,
          weight: 600,
          style: 'normal',
        },
        {
          name: 'Helvetica Neue',
          data: fontBold,
          weight: 700,
          style: 'normal',
        },
      ],
    }
  );

  return svg;
}

// Convert SVG to JPEG using resvg and sharp
async function svgToJpeg(svg) {
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: 1200,
    },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  // Convert PNG to JPEG using sharp
  const jpegBuffer = await sharp(pngBuffer)
    .jpeg({ quality: 90 })
    .toBuffer();

  return jpegBuffer;
}

// Main function
async function main() {
  console.log('Starting OG image generation...\n');

  // Ensure pages OG directory exists
  if (!fs.existsSync(PAGES_OG_DIR)) {
    fs.mkdirSync(PAGES_OG_DIR, { recursive: true });
  }

  // Load cache
  const cache = loadCache();

  // Get all posts, pages, and homepage
  const blogPosts = getPosts(BLOG_DIR, 'blog');
  const rawPosts = getPosts(RAW_DIR, 'raw');
  const pages = getPages();
  const homepage = getHomepage();
  const allItems = [...blogPosts, ...rawPosts, ...pages, homepage];

  console.log(`Found ${blogPosts.length} blog posts, ${rawPosts.length} raw notes, and ${pages.length + 1} pages (incl. homepage)\n`);

  let generated = 0;
  let skipped = 0;
  let cached = 0;

  for (const item of allItems) {
    // Determine output path based on collection type
    const outputPath = item.collection === 'pages'
      ? path.join(PAGES_OG_DIR, `${item.slug}.jpeg`)
      : path.join(item.folderPath, 'og.jpeg');

    const cacheKey = `${item.collection}-${item.slug}`;

    // Skip items that already have an OG image or custom image frontmatter
    if (item.hasExistingOg || item.hasCustomImage) {
      skipped++;
      continue;
    }

    // Check cache
    if (cache[cacheKey] === item.contentHash && fs.existsSync(outputPath)) {
      cached++;
      continue;
    }

    try {
      // Generate SVG
      const svg = await generateOgSvg(item.title, item.description);

      // Convert to JPEG
      const jpeg = await svgToJpeg(svg);

      // Write file
      fs.writeFileSync(outputPath, jpeg);

      // Update cache
      cache[cacheKey] = item.contentHash;

      generated++;
      if (item.collection === 'pages') {
        console.log(`Generated: pages/${item.slug}.jpeg`);
      } else {
        console.log(`Generated: ${item.collection}/${item.slug}/og.jpeg`);
      }
    } catch (error) {
      console.error(`Error generating ${item.collection}/${item.slug}:`, error.message);
    }
  }

  // Save cache
  saveCache(cache);

  console.log(`\nOG Image Generation Complete!`);
  console.log(`  Generated: ${generated}`);
  console.log(`  Cached: ${cached}`);
  console.log(`  Skipped (existing og/custom image): ${skipped}`);
}

main().catch(console.error);
