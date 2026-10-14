import { test, expect } from "@playwright/test";

// Inspect rendered text against its composited surface, including gradient stops.
// Fixtures below exercise the UI without calling a paid model or recording votes.
async function unreadableText(page) {
  return page.evaluate(() => {
    const rgb = (value) => (value.match(/[\d.]+/g) || []).map(Number);
    const blend = (front, back) => {
      const alpha = front[3] ?? 1;
      return front
        .slice(0, 3)
        .map((channel, i) => channel * alpha + back[i] * (1 - alpha));
    };
    const lum = (color) =>
      color
        .map((channel) => {
          const c = channel / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        })
        .reduce((total, c, i) => total + c * [0.2126, 0.7152, 0.0722][i], 0);
    const background = (el) => {
      const ancestors = [];
      for (let node = el; node; node = node.parentElement)
        ancestors.unshift(node);
      let colors = [[255, 255, 255]];
      for (const node of ancestors) {
        const style = getComputedStyle(node);
        colors = colors.map((color) =>
          blend(rgb(style.backgroundColor), color),
        );
        const stops = style.backgroundImage.match(/rgba?\([^)]+\)/g);
        if (
          stops &&
          style.backgroundClip !== "text" &&
          style.webkitBackgroundClip !== "text"
        ) {
          const gradient = colors.flatMap((color) =>
            stops.map((stop) => blend(rgb(stop), color)),
          );
          // Radial gradients leave some of the base surface uncovered.
          colors = style.backgroundImage.startsWith("radial")
            ? [...colors, ...gradient]
            : gradient;
          colors = colors.slice(0, 24);
        }
      }
      return colors;
    };
    const seen = new Set(),
      failures = [];
    const inspect = (el, text, placeholder = false) => {
      if (!text || !el || el.closest("svg, script, style, [disabled]")) return;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
        return;
      const style = getComputedStyle(el, placeholder ? "::placeholder" : null);
      const foregrounds =
        style.backgroundClip === "text" || style.webkitBackgroundClip === "text"
          ? (
              style.backgroundImage.match(/rgba?\([^)]+\)/g) || [style.color]
            ).map(rgb)
          : [rgb(style.color)];
      const surfaces = background(el);
      const ratio = Math.min(
        ...foregrounds.flatMap((foreground) =>
          surfaces.map((surface) => {
            const a = lum(blend(foreground, surface)),
              b = lum(surface);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          }),
        ),
      );
      const size = parseFloat(style.fontSize),
        bold = parseInt(style.fontWeight) >= 700;
      const minimum = size >= 24 || (bold && size >= 18.667) ? 3 : 4.5;
      const key = `${el.tagName}.${el.className}:${el.parentElement?.className}:${placeholder}:${style.color}`;
      const label = `${el.parentElement?.className} > ${el.tagName.toLowerCase()}.${el.className} ${text.slice(0, 45)}`;
      if (ratio + 0.01 < minimum && !seen.has(key)) {
        seen.add(key);
        failures.push({
          label,
          ratio: +ratio.toFixed(2),
          minimum,
          color: style.color,
        });
      }
    };
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode())
      inspect(
        walker.currentNode.parentElement,
        walker.currentNode.textContent.trim(),
      );
    document
      .querySelectorAll(
        "input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, select",
      )
      .forEach((el) => {
        const value =
          el.tagName === "SELECT"
            ? el.selectedOptions[0]?.textContent
            : el.value;
        inspect(
          el,
          value || el.getAttribute("placeholder"),
          !value && Boolean(el.getAttribute("placeholder")),
        );
      });
    return failures;
  });
}

test("text remains readable across pages, disclosure panels and both themes", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const sample = await (await request.get("/api/sample")).json();
  const id = "00000000-0000-4000-8000-000000000888";
  const freezeId = "00000000-0000-4000-8000-000000000889";
  const verdictId = "00000000-0000-4000-8000-000000000890";
  const directId = "00000000-0000-4000-8000-000000000891";
  const at = "2026-10-13T12:00:00.000Z";
  const branches = {
    llm: {
      pick: "A",
      confidence: 77,
      source: "Fixture model",
      answer: "Synthetic fixture answer.",
    },
    qloo: {
      pick: "TIE",
      confidence: 40,
      source: "Text heuristic fallback",
      fallback: true,
    },
    agent: {
      pick: "A",
      confidence: 78,
      source: "Fixture model",
      answer: "Synthetic fixture answer.",
    },
  };
  const base = {
    ...sample,
    id,
    title: "Contrast fixture A vs B",
    isSample: false,
    mode: "real",
    createdAt: at,
    closedAt: null,
    pollOpenedAt: at,
    votes: [0, 0],
    totalVotes: 0,
    verdict: null,
  };
  const paired = {
    ...base,
    isPairedComparison: true,
    comparison: {
      sha256: "a".repeat(64),
      payload: {
        provider: "replicate",
        model: "fixture-model",
        committedAt: at,
        aiOnly: {
          choice: "A",
          confidence: 77,
          rationale: "Synthetic fixture reasoning.",
        },
        qloo: {
          choice: "TIE",
          confidence: 40,
          rationale: "No direct option entity signal in this fixture.",
          fallback: true,
        },
        aiQloo: {
          choice: "A",
          confidence: 78,
          rationale: "Synthetic fixture reasoning with audience context.",
        },
      },
    },
  };
  const frozen = {
    ...base,
    id: freezeId,
    freezeRequired: true,
    frozenAt: at,
    lifecycle: "predictions frozen",
    freeze: {
      sha256: "b".repeat(64),
      payload: {
        mode: "manual",
        caseLabel: "QA fixture",
        frozenAt: at,
        metadata: { track: "rehearsal" },
        branches,
        note: "Synthetic contrast fixture, no benchmark evidence.",
      },
    },
  };
  await page.route(`**/api/tests/${id}**`, (route) =>
    route.fulfill({ json: paired }),
  );
  await page.route(`**/api/tests/${directId}**`, (route) =>
    route.fulfill({
      json: {
        ...paired,
        id: directId,
        provenance: {
          ...paired.provenance,
          qlooFallback: false,
          qlooOptionSignal: true,
        },
        comparison: {
          ...paired.comparison,
          payload: {
            ...paired.comparison.payload,
            qlooEvidence: {
              source: "Qloo API",
              seeds: [
                { entity_id: "fixture-seed", name: "Fixture audience taste" },
              ],
              tasteProfile: {
                mode: "real",
                status: "available",
                tags: [
                  {
                    tag_id: "urn:tag:genre:media:fixture",
                    name: "Fixture Drama",
                    affinity: 0.9,
                  },
                ],
              },
              recommendations: [
                {
                  entity_id: "fixture-film",
                  name: "Fixture film A",
                  explainability: {
                    "signal.interests.entities": [
                      { entity_id: "fixture-seed", score: 0.7 },
                    ],
                  },
                },
              ],
            },
            qloo: {
              choice: "A",
              confidence: 80,
              rationale: "Fixture direct affinity for confirmed entities.",
              fallback: false,
              method: "direct-entity-affinity",
              affinities: [
                { label: "A", name: "Fixture film A", affinity: 0.8 },
                { label: "B", name: "Fixture film B", affinity: 0.3 },
              ],
            },
          },
        },
      },
    }),
  );
  await page.route(`**/api/tests/${freezeId}**`, (route) =>
    route.fulfill({ json: frozen }),
  );
  await page.route(`**/api/tests/${verdictId}**`, (route) =>
    route.fulfill({
      json: {
        ...frozen,
        id: verdictId,
        closedAt: at,
        votes: [14, 6],
        totalVotes: 20,
        verdict: {
          actual: 0,
          predicted: 0,
          share: 70,
          recommendation: "Synthetic contrast fixture recommendation.",
        },
        benchmarkResult: {
          grades: { llm: "MATCH", qloo: "ABSTAIN", agent: "MATCH" },
        },
      },
    }),
  );
  for (const music of [false, true]) {
    const options = ["Fixture A", "Fixture B"].map((name, index) => ({
      name,
      title: name,
      description: "Synthetic contrast fixture.",
      movieId: String(index + 4),
      artistId: String(index + 4),
      year: 1995,
      genres: ["Drama"],
    }));
    await page.route(
      `**/api/${music ? "music-proxy" : "proxy"}/runs/${id}`,
      (route) =>
        route.fulfill({
          json: {
            ...base,
            options,
            proxyCaseId: music ? "MX-001" : "PX-001",
            caseSetHash: "fixture",
            frozenAt: at,
            input: {
              id: music ? "MX-001" : "PX-001",
              options,
              seeds: options,
              audienceDefinition: "Synthetic fixture audience.",
            },
            freeze: frozen.freeze,
            scoringVersion: "qloo-candidate-affinity-v1",
            lifecycle: "revealed",
            outcome: {
              actual: "A",
              segmentUsers: 30,
              options: [
                {
                  mean: 4.3,
                  count: 25,
                  overallRatings: 500,
                  overallListeners: 500,
                },
                {
                  mean: 3.5,
                  count: 25,
                  overallRatings: 500,
                  overallListeners: 500,
                },
              ],
            },
            result: {
              grades: { llm: "MATCH", qloo: "ABSTAIN", agent: "MATCH" },
            },
          },
        }),
    );
  }
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { mode: "real", configured: true } }),
  );
  await page.route("**/api/search?**", (route) =>
    route.fulfill({
      json: {
        mode: "real",
        results: {
          entities: [1, 2, 3].map((i) => ({
            entity_id: `fixture-${i}`,
            name: `Fixture cafe ${i}`,
            category: "Dining",
            locationLabel: "12 Main Street · Fixture city",
          })),
        },
      },
    }),
  );
  const routes = [
    ["/", null],
    ["/?view=verdict", null],
    ["/create", null],
    ["/benchmark/new", null],
    ["/benchmark", null],
    ["/faq", null],
    ["/case-study/cookie-cats", null],
    ["/benchmark/film/PX-001", null],
    ["/benchmark/music/MX-001", null],
    [`/test/${id}?view=prediction`, ".ai-pick"],
    [`/test/${directId}?view=prediction`, ".qloo-evidence"],
    [`/test/${freezeId}?view=prediction`, ".freeze-certificate"],
    [`/test/${verdictId}?view=verdict`, ".verdict-artefact"],
    [`/benchmark/film/run/${id}`, ".proxy-outcome"],
    [`/benchmark/music/run/${id}`, ".proxy-outcome"],
    [`/poll/${id}`, ".poll-choice"],
  ];
  const failures = [];
  for (const mode of ["dark", "light"]) {
    for (const [path, ready] of routes) {
      await page.goto(path);
      await expect(page.locator(ready || "main h1").first()).toBeVisible();
      if ((await page.locator("html").getAttribute("data-theme")) !== mode)
        await page.locator(".theme-toggle").click();
      await page.evaluate(async () => {
        await document.fonts.ready;
        document.querySelectorAll("details").forEach((el) => {
          el.open = true;
        });
      });
      const issues = await unreadableText(page);
      if (issues.length) failures.push({ mode, path, issues });
      if (path === "/create") {
        await page.getByRole("tab", { name: "Dining", exact: true }).click();
        await page
          .getByRole("textbox", { name: "Search taste seeds" })
          .fill("Fixture cafe");
        for (let i = 1; i <= 3; i++)
          await page
            .getByRole("button", {
              name: `Fixture cafe ${i} · 12 Main Street · Fixture city`,
              exact: true,
            })
            .click();
        await expect(page.locator(".selection-count")).toContainText("3 / 5");
        const selectedIssues = await unreadableText(page);
        if (selectedIssues.length)
          failures.push({
            mode,
            path: `${path} selected seeds`,
            issues: selectedIssues,
          });
        await page.getByRole("button", { name: "Known items in Qloo" }).click();
        await page.getByLabel("Find Option A in Qloo").fill("Fixture cafe");
        await expect(
          page.getByRole("button", {
            name: /Confirm Option A: Fixture cafe 1/,
          }),
        ).toBeVisible();
        const pickerIssues = await unreadableText(page);
        if (pickerIssues.length)
          failures.push({
            mode,
            path: `${path} Qloo matches`,
            issues: pickerIssues,
          });
        await page
          .getByRole("button", { name: /Confirm Option A: Fixture cafe 1/ })
          .click();
        const confirmedIssues = await unreadableText(page);
        if (confirmedIssues.length)
          failures.push({
            mode,
            path: `${path} confirmed item`,
            issues: confirmedIssues,
          });
      }
      if (path.startsWith("/poll/")) {
        await page.locator(".poll-choice").first().hover();
        const hoverIssues = await unreadableText(page);
        if (hoverIssues.length)
          failures.push({ mode, path: `${path} hover`, issues: hoverIssues });
      }
      if (path === "/?view=verdict") {
        await page
          .locator(".verdict-chat")
          .getByRole("button", { name: "Why this pick?" })
          .click();
        await expect(page.locator(".verdict-chat-messages")).toContainText(
          "Option A",
        );
        const answerIssues = await unreadableText(page);
        if (answerIssues.length)
          failures.push({
            mode,
            path: `${path} chat answer`,
            issues: answerIssues,
          });
      }
    }
  }
  expect(failures).toEqual([]);
});
