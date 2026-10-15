(() => {
  const API = "/apps/vibeproof";

  const text = (tag, className, value) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = value || "";
    return el;
  };

  const stars = (rating) => {
    const el = text("span", "vibeproof-stars", "");
    const rounded = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    el.textContent = "★".repeat(rounded) + "☆".repeat(5 - rounded);
    el.setAttribute("aria-label", rounded + " out of 5 stars");
    return el;
  };

  const applyTheme = (root, theme) => {
    if (!theme) return;
    root.style.setProperty("--vp-accent", theme.accentColor || "#111111");
    root.style.setProperty("--vp-bg", theme.backgroundColor || "#FFFFFF");
    root.style.setProperty("--vp-text", theme.textColor || "#111111");
    root.style.setProperty("--vp-border", theme.borderColor || "#E5E7EB");
    root.style.setProperty("--vp-radius", String(theme.radius || 18) + "px");
    root.style.setProperty(
      "--vp-media-ratio",
      String(theme.mediaRatio || "4/5").replace("/", " / "),
    );
  };

  const apiUrl = (root) => {
    const params = new URLSearchParams({
      product_handle: root.dataset.vibeproofProductHandle || "",
      product_id: root.dataset.vibeproofProductId || "",
    });
    return API + "?" + params.toString();
  };

  const loadData = async (root) => {
    const response = await fetch(apiUrl(root), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Unable to load VibeProof");
    return response.json();
  };

  const renderRating = (root, data) => {
    root.replaceChildren();

    if (!data.enabled || !data.count) {
      root.append(text("span", "vibeproof-empty", "No reviews yet"));
      return;
    }

    root.append(stars(data.rating));
    root.append(
      text(
        "span",
        "",
        Number(data.rating).toFixed(1) +
          " · " +
          data.count +
          " review" +
          (data.count === 1 ? "" : "s"),
      ),
    );
  };

  const helpful = async (button, reviewId) => {
    button.disabled = true;
    const body = new URLSearchParams({
      intent: "helpful",
      reviewId,
    });

    try {
      const response = await fetch(API, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        body,
      });

      if (response.ok) {
        const current = Number(button.dataset.count || "0") + 1;
        button.dataset.count = String(current);
        button.textContent = "♡ Helpful · " + current;
      }
    } finally {
      button.disabled = false;
    }
  };

  const renderFeed = (root, data) => {
    root.replaceChildren();
    if (!data.enabled) return;

    const theme = data.theme || {};
    applyTheme(root, theme);
    root.classList.add(
      "vibeproof-layout-" + (theme.layout || "SOCIAL_FEED"),
    );

    const overrideHeading = (root.dataset.vibeproofHeading || "").trim();
    root.append(
      text(
        "h2",
        "vibeproof-heading",
        overrideHeading || theme.heading || "Reviews",
      ),
    );

    if (!data.reviews || !data.reviews.length) {
      root.append(text("div", "vibeproof-empty", "No published reviews yet."));
      return;
    }

    const cards = document.createElement("div");
    cards.className = "vibeproof-cards";
    const limit = Math.max(
      1,
      Math.min(20, Number(root.dataset.vibeproofLimit || "8")),
    );

    const reviewList =
      theme.layout === "VIDEO_FIRST"
        ? [...data.reviews].sort((a, b) => {
            const aVideo = (a.media || []).some((item) =>
              String(item.type || "").toLowerCase().includes("video"),
            );
            const bVideo = (b.media || []).some((item) =>
              String(item.type || "").toLowerCase().includes("video"),
            );
            return Number(bVideo) - Number(aVideo);
          })
        : data.reviews;

    reviewList.slice(0, limit).forEach((review) => {
      const card = document.createElement("article");
      card.className = "vibeproof-card";

      const media = review.media && review.media[0];
      if (media && media.url) {
        if (String(media.type || "").toLowerCase().includes("video")) {
          const video = document.createElement("video");
          video.className = "vibeproof-card-media";
          video.src = media.url;
          video.controls = true;
          video.playsInline = true;
          video.preload = "metadata";
          card.append(video);
        } else {
          const image = document.createElement("img");
          image.className = "vibeproof-card-media";
          image.src = media.url;
          image.alt = media.altText || "Customer review media";
          image.loading = "lazy";
          card.append(image);
        }
      }

      const body = document.createElement("div");
      body.className = "vibeproof-card-body";

      const author = document.createElement("div");
      author.className = "vibeproof-author";
      author.append(text("strong", "", review.reviewerName || "Customer"));
      if (theme.showVerified && review.verifiedPurchase) {
        author.append(text("span", "vibeproof-verified", "Verified"));
      }
      body.append(author);
      body.append(stars(review.rating));

      if (review.title) {
        body.append(text("h3", "vibeproof-title", review.title));
      }

      body.append(text("p", "vibeproof-body", review.body || ""));

      if (review.variantTitle) {
        body.append(
          text(
            "div",
            "vibeproof-meta",
            "Purchased: " + review.variantTitle,
          ),
        );
      }

      if (review.merchantReply) {
        const reply = document.createElement("div");
        reply.className = "vibeproof-reply";
        reply.append(
          text(
            "strong",
            "",
            review.merchantReply.merchantName || "Store reply",
          ),
        );
        reply.append(document.createElement("br"));
        reply.append(
          document.createTextNode(review.merchantReply.body || ""),
        );
        body.append(reply);
      }

      if (theme.showHelpful) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "vibeproof-helpful";
        button.dataset.count = String(review.helpfulCount || 0);
        button.textContent =
          "♡ Helpful · " + String(review.helpfulCount || 0);
        button.addEventListener("click", () => helpful(button, review.id));
        body.append(button);
      }

      card.append(body);
      cards.append(card);
    });

    root.append(cards);
  };


  const renderGallery = (root, data) => {
    root.replaceChildren();
    if (!data.enabled) return;

    const theme = data.theme || {};
    applyTheme(root, theme);

    root.append(
      text(
        "h2",
        "vibeproof-heading",
        (root.dataset.vibeproofHeading || "").trim() || "SEEN ON THE GIRLIES",
      ),
    );

    const media = [];
    (data.reviews || []).forEach((review) => {
      (review.media || []).forEach((item) => {
        if (item && item.url) {
          media.push({
            ...item,
            reviewerName: review.reviewerName || "Customer",
            rating: review.rating,
          });
        }
      });
    });

    const limit = Math.max(
      2,
      Math.min(20, Number(root.dataset.vibeproofLimit || "8")),
    );

    if (!media.length) {
      root.append(
        text(
          "div",
          "vibeproof-empty",
          "Customer media will appear here once photo or video reviews are available.",
        ),
      );
      return;
    }

    const grid = document.createElement("div");
    grid.className = "vibeproof-gallery";

    media.slice(0, limit).forEach((item) => {
      const figure = document.createElement("figure");
      figure.className = "vibeproof-gallery-item";

      if (String(item.type || "").toLowerCase().includes("video")) {
        const video = document.createElement("video");
        video.src = item.url;
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        figure.append(video);
      } else {
        const image = document.createElement("img");
        image.src = item.url;
        image.alt = item.altText || "Customer review media";
        image.loading = "lazy";
        figure.append(image);
      }

      const caption = document.createElement("figcaption");
      caption.append(text("strong", "", item.reviewerName));
      caption.append(document.createTextNode(" · "));
      caption.append(stars(item.rating));
      figure.append(caption);

      grid.append(figure);
    });

    root.append(grid);
  };

  const field = (labelText, input) => {
    const label = document.createElement("label");
    label.append(text("span", "", labelText));
    label.append(input);
    return label;
  };

  const renderForm = (root, data) => {
    root.replaceChildren();
    if (!data.enabled) return;

    const theme = data.theme || {};
    const settings = data.collection || {};
    applyTheme(root, theme);

    root.append(
      text(
        "h2",
        "vibeproof-heading",
        (root.dataset.vibeproofHeading || "").trim() || "Share your vibe",
      ),
    );

    const form = document.createElement("form");
    form.className = "vibeproof-form";

    if (settings.collectRating !== false) {
      const rating = document.createElement("select");
      rating.name = "rating";
      rating.required = true;

      const optionData = [
        ["", "Choose a rating"],
        ["5", "★★★★★ 5"],
        ["4", "★★★★☆ 4"],
        ["3", "★★★☆☆ 3"],
        ["2", "★★☆☆☆ 2"],
        ["1", "★☆☆☆☆ 1"],
      ];

      optionData.forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        rating.append(option);
      });

      form.append(field("Rating", rating));
    }

    if (settings.collectTitle !== false) {
      const input = document.createElement("input");
      input.name = "title";
      input.maxLength = 120;
      form.append(field("Review title", input));
    }

    if (settings.collectBody !== false) {
      const input = document.createElement("textarea");
      input.name = "body";
      input.required = true;
      input.maxLength = 2000;
      form.append(field("Your review", input));
    }

    const name = document.createElement("input");
    name.name = "reviewerName";
    name.required = true;
    name.maxLength = 80;
    form.append(field("Name", name));

    if (settings.collectEmail !== false) {
      const email = document.createElement("input");
      email.type = "email";
      email.name = "reviewerEmail";
      email.required = Boolean(settings.requireEmail);
      email.maxLength = 160;
      form.append(field("Email", email));
    }

    const message = text("div", "vibeproof-message", "");
    const submit = text("button", "vibeproof-submit", "Submit review");
    submit.type = "submit";
    form.append(submit, message);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      message.textContent = "Submitting…";

      const values = new FormData(form);
      values.set("intent", "submit_review");
      values.set(
        "productId",
        root.dataset.vibeproofProductId || "",
      );
      values.set(
        "productHandle",
        root.dataset.vibeproofProductHandle || "",
      );
      values.set(
        "productTitle",
        root.dataset.vibeproofProductTitle || "",
      );

      const params = new URLSearchParams();
      values.forEach((value, key) => {
        params.set(key, String(value));
      });

      try {
        const response = await fetch(API, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            Accept: "application/json",
          },
          body: params,
        });

        const result = await response.json();
        message.textContent =
          result.message || result.error || "Review submitted.";

        if (result.ok) form.reset();
      } catch {
        message.textContent =
          "We couldn’t submit that review. Please try again.";
      } finally {
        submit.disabled = false;
      }
    });

    root.append(form);
  };

  const init = async (root) => {
    try {
      const data = await loadData(root);

      if (root.dataset.vibeproofMode === "rating") {
        applyTheme(root, data.theme);
        renderRating(root, data);
      } else if (root.dataset.vibeproofMode === "form") {
        renderForm(root, data);
      } else if (root.dataset.vibeproofMode === "gallery") {
        renderGallery(root, data);
      } else {
        renderFeed(root, data);
      }
    } catch {
      root.replaceChildren(
        text(
          "span",
          "vibeproof-empty",
          "Reviews are unavailable right now.",
        ),
      );
    }
  };

  document
    .querySelectorAll(
      ".vibeproof-root[data-vibeproof-product-handle]",
    )
    .forEach((root) => init(root));
})();
