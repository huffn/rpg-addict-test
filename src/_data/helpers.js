const rpgSystemNamesMap = {
  'CoM': 'City of Mist',
  'ToX': 'Tales of Xadia',
  'FabUlt': 'Fabula Ultima',
}

/**
 * Returns back some attributes based on whether the
 * link is active or a parent of an active item
 *
 * @param {String} itemUrl The link in question
 * @param {String} pageUrl The page context
 * @returns {String} The attributes or empty
 */

export function getLinkActiveState(itemUrl, pageUrl) {
	let response = '';

	if (itemUrl === pageUrl) {
		response = ' aria-current="page"';
	}

	if (itemUrl.length > 1 && pageUrl.indexOf(itemUrl) === 0) {
		response += ' data-state="active"';
	}

	return response;
}

export function readableRPGName(name) {
  if (rpgSystemNamesMap[name]) {
    return rpgSystemNamesMap[name];
  }
  return name;
}

export function relatedPostsByRecent(posts = [], currentPost, limit = 0) {
  const foundPost = posts.find(
    (post) => post.url === currentPost.url
  );

  const relatedPosts = posts
    .filter((post) => post.url !== currentPost.url)
    .filter((post) => {
      if (!post.data.tags || !foundPost?.data.tags) {
        return false;
      }

      return post.data.tags.every((tag) =>
        foundPost.data.tags.includes(tag)
      );
    });

  return limit > 0
    ? relatedPosts.slice(0, limit)
    : relatedPosts;
}
