---
title: "Blog Posts"
eleventyNavigation:
  key: Blog
  order: 2
---


{% for post in collections.blogPosts %}
[{{ post.data.title }}]({{ post.url }}) ({{ post.date | luxonDate('MMMM dd, yyyy') }})
{% endfor %}
