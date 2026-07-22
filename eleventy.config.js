import eleventyNavigationPlugin from "@11ty/eleventy-navigation";
import { execSync } from 'child_process';
import { DateTime } from "luxon";
import EleventyPluginOgImage from 'eleventy-plugin-og-image';
import { promises as fs } from 'node:fs';


export default function (eleventyConfig) {
  eleventyConfig.setInputDirectory('src');
  eleventyConfig.setOutputDirectory('dist');
  // Set directories to pass through to the dist folder
  eleventyConfig.addPassthroughCopy({ 'src/css': 'css' });
  eleventyConfig.addPassthroughCopy({ 'src/assets': 'assets' });
  eleventyConfig.addPlugin(eleventyNavigationPlugin);

  eleventyConfig.amendLibrary('md', (mdLib) => {
    mdLib.set({ html: true, linkify: true, typographer: true });
  });

  eleventyConfig.addTransform('show-video', (content) => {
    const regex = /<img\s+[^>]*src="(.+\.mp4)"\s+[^>]*alt="([^"]*)"[^>]*>/gi;

    const updatedContent = content.replace(regex, (match, src, alt) => {
      return `<video src="${src}" title="${alt}" controls></video>`;
    });
    return updatedContent;
  });

  eleventyConfig.addFilter('readableDate', (dateObj) => {
    if (!dateObj) return '';
    return new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(new Date(dateObj));
  })

  eleventyConfig.addFilter('dateIso', (dateObj) => {
    if (!dateObj) return '';
    return new Date(dateObj).toISOString();
  })

  eleventyConfig.addFilter('luxonDate', (dateObj, format = 'yyyy-MM-dd') => {
    if (!dateObj) return '';
    return DateTime.fromJSDate(new Date(dateObj), { zone: 'utc'}).toFormat(format);
  })

  eleventyConfig.addFilter('readingTime', (content = '') => {
    const words = content
      .replace(/(<([^>]+)>)/gi, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    const minutes = Math.max(1, Math.ceil(words / 225));
    return `${minutes} min read`;
  })

  eleventyConfig.addFilter('slug', (value = '') => {
    value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  })

  eleventyConfig.addFilter('json', (value) => JSON.stringify(value));

  eleventyConfig.addFilter('absoluteUrl', (path = '', base = '') => {
    const normalizedBase = (base || '').replace(/\/$/, '');
    if (!path) return normalizedBase;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${normalizedBase}${path.startsWith('/') ? '' : '/'}${path}`;
  });

  eleventyConfig.addCollection('tagList', (collectionApi) => {
    const tags = new Set();
    collectionApi.getAll().forEach((item) => {
      (item.data.tags || [])
        .filter((tag) => tag !== 'posts')
        .forEach((tag) => tags.add(tag));
    });
    return [...tags].sort((a, b) => a.localeCompare(b));
  });

  eleventyConfig.addCollection('campaigns', (collectionApi) => {
    const allCampaignPages = collectionApi.getFilteredByGlob('src/campaigns/**/*');
    const campaigns = new Set();
    allCampaignPages.forEach((item) => {
      if (item.template.fileSlug) {
        if (item.template.fileSlug.dirs.length >= 1) campaigns.add(item.template.fileSlug.dirs[1]);
      }
    });
    return [...campaigns].map((campaign) => {
      const campaignPages = collectionApi.getFilteredByGlob(`src/campaigns/${campaign}/**/*`);
      return {
        name: campaign,
        url: `/campaigns/${campaign}/`,
        pages: campaignPages,
      }
    })
  });

  eleventyConfig.addCollection("blogPosts", (collectionApi) => {
    return collectionApi.getFilteredByTag("blog-post");
  });

  eleventyConfig.addPlugin(EleventyPluginOgImage, {
    satoriOptions: {
      fonts: [
        {
          name: 'Inter',
          data: fs.readFile('./src/assets/InterVariable.woff2'),
          weight: 700,
          style: 'normal',
        },
      ],
    },
  });

  eleventyConfig.on('eleventy.after', async () => {
    execSync(`npx -y pagefind --site dist`, { encoding: 'utf-8' });
  })

}

export const config = {
  markdownTemplateEngine: 'njk',
  htmlTemplateEngine: 'njk',
  templateFormats: ['md', 'njk', 'html']
}
