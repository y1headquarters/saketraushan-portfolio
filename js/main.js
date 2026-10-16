(() => {
	/* always load at the very top — browsers remember scroll position
	   across same-tab refreshes by default */
	if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
	window.scrollTo(0, 0);

	/* no entrance animation — every card renders at full opacity right
	   away, confirmed this is what's wanted over a staggered reveal */

	/* ===== per-card hover image-cycle (mirrors the cross-fade-through-frames card) ===== */
	document.querySelectorAll('[data-cycle]').forEach((card) => {
		const frames = Array.from(card.querySelectorAll('.frame'));
		if (frames.length < 2) return;
		let i = 0;
		let timer = null;

		function next() {
			frames[i].classList.remove('is-active');
			i = (i + 1) % frames.length;
			frames[i].classList.add('is-active');
		}
		card.addEventListener('mouseenter', () => {
			timer = setInterval(next, 900);
		});
		card.addEventListener('mouseleave', () => {
			clearInterval(timer);
			frames.forEach((f, idx) => f.classList.toggle('is-active', idx === 0));
			i = 0;
		});
	});

	/* ===== reel crossfade + grow: the grid fades out while the reel
	   grows larger, all driven by the same progress value. The side
	   columns are pushed outward by exactly however far the reel's own
	   edges have moved from their rest position — not by an
	   independent gap animation — so the padding between the reel and
	   its immediate neighbors (columns 3 and 5) never changes; it's
	   only columns 1,2 (pushed along with 3) and 6,7 (pushed along
	   with 5) that visibly spread apart. ===== */
	const reelCard = document.getElementById('reelCard');
	const reelTrigger = document.getElementById('reelTrigger');
	const reelSpacer = document.querySelector('.reel-spacer');
	const reelLanding = document.getElementById('reelLanding');
	const scrollHint = document.getElementById('scrollHint');
	const masonry = document.getElementById('masonry');
	const gcols = masonry ? Array.from(masonry.querySelectorAll('.gcol')) : [];
	const firstGcol = gcols[0];
	const leftCols = gcols.filter((el) => parseFloat(getComputedStyle(el).getPropertyValue('--side')) < 0);
	const rightCols = gcols.filter((el) => parseFloat(getComputedStyle(el).getPropertyValue('--side')) > 0);
	const root = document.documentElement;

	// grid gap stays fixed (base CSS value) — lock the column tracks to
	// their natural width once so nothing shifts when side columns get
	// a translateX later
	let lockedColWidth = null;
	function lockColumnWidth() {
		if (lockedColWidth || !firstGcol || window.innerWidth < 800) return;
		lockedColWidth = firstGcol.getBoundingClientRect().width;
		masonry.style.gridTemplateColumns = `repeat(7, ${lockedColWidth}px)`;
	}

	// Before scroll, every column's cards must land edge-to-edge inside
	// .work's top/bottom padding — exactly, neither short of it nor
	// past it. Cards keep their natural (--ar driven) height except
	// for whatever's needed to absorb the difference between the
	// column's natural total and the available height; that
	// adjustment is applied starting from the bottom-most (non-fixed)
	// card and walking upward — so upper cards never move, and if a
	// column runs long, the lowest card(s) shrink (collapsing
	// entirely once there's no room left); if a column runs short,
	// only the lowest card stretches to close the gap. scroll-hint is
	// a fixed-height button, never resized — the card above it
	// absorbs its column's adjustment instead.
	let columnsFitted = false;
	function fitColumnsToViewport() {
		if (columnsFitted || !masonry || !firstGcol || window.innerWidth < 800) return;
		const workEl = document.querySelector('.work');
		if (!workEl) return;
		const cs = getComputedStyle(workEl);
		const availableHeight = window.innerHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
		const colWidth = firstGcol.getBoundingClientRect().width;
		const gapPx = parseFloat(getComputedStyle(firstGcol).rowGap) || 16;

		gcols.forEach((col) => {
			const items = Array.from(col.children).map((el, idx) => {
				const isFixed = el.classList.contains('scroll-hint');
				const h = isFixed
					? el.getBoundingClientRect().height
					: colWidth / (parseFloat(getComputedStyle(el).getPropertyValue('--ar')) || 0.75);
				return { el, isFixed, gap: idx === 0 ? 0 : gapPx, h };
			});

			const total = items.reduce((sum, it) => sum + it.gap + it.h, 0);
			let delta = availableHeight - total; // >0 column falls short, <0 column overflows

			for (let i = items.length - 1; i >= 0 && delta !== 0; i--) {
				const it = items[i];
				if (it.isFixed) continue;
				const newH = it.h + delta;
				if (newH <= 0) {
					delta += it.h;
					it.h = 0;
				} else {
					it.h = newH;
					delta = 0;
				}
			}

			// collapsed cards get height:0 rather than display:none — a
			// hidden card still occupies its gap in the flex layout
			// (display:none would remove that gap too, undercounting
			// the column's total by one gapPx versus the sum above)
			items.forEach((it) => {
				if (it.isFixed) return;
				it.el.style.height = Math.max(0, it.h).toFixed(1) + 'px';
			});
		});
		columnsFitted = true;
	}

	// Height swap: in every column except gcol--main, the first card
	// loses height and the third card gains that exact same amount, in
	// sync with the horizontal column-spread below (same progress
	// value) — so the total stays identical to the resting fit at
	// every point (nothing above the first card, the second card, or
	// anything from the third card downward needs to move to
	// compensate; the column still ends exactly on the bottom padding
	// the whole time).
	const cropCols = gcols.filter((el) => !el.classList.contains('gcol--main'));
	let cropBase = null;
	function lockCropBase() {
		if (cropBase || window.innerWidth < 800) return;
		cropBase = cropCols.map((col) => {
			const cards = Array.from(col.children).filter((c) => !c.classList.contains('scroll-hint'));
			const first = cards[0];
			const third = cards[2];
			return {
				first: first ? { el: first, h: first.getBoundingClientRect().height } : null,
				third: third ? { el: third, h: third.getBoundingClientRect().height } : null,
			};
		});
	}

	// Column 4 (gcol--main) is sequential, not simultaneous: image 1
	// (already tiny, ~10-15px at rest) collapses to 0 first; only once
	// it's fully gone does image 2 start losing height. Image 1 is
	// top-anchored with a compensating margin while it shrinks (same
	// trick as the crop swap above) so image 2 doesn't move during
	// that first phase; image 2 then shrinks on its own in the second
	// phase.
	const mainCol = masonry ? masonry.querySelector('.gcol--main') : null;
	const mainImgs = mainCol
		? Array.from(mainCol.children).filter((c) => !c.classList.contains('reel-spacer') && !c.classList.contains('scroll-hint'))
		: [];
	const [mainImg1, mainImg2] = mainImgs;
	let mainImgBase = null;
	function lockMainImgBase() {
		if (mainImgBase || !mainImg1 || !mainImg2 || window.innerWidth < 800) return;
		mainImgBase = {
			h1: mainImg1.getBoundingClientRect().height,
			h2: mainImg2.getBoundingClientRect().height,
			gap: parseFloat(getComputedStyle(mainCol).rowGap) || 16,
		};
	}

	// FLIP: the reel's rest-state box is wherever .reel-spacer naturally
	// lands in the grid flow (captured once at scrollY 0, before the
	// reel has grown at all) — grown/moved from there via plain lerp,
	// so #reelCard always starts out looking like a normal in-grid card.
	let homeRect = null;
	function lockHomeRect() {
		if (homeRect || !reelSpacer) return;
		const r = reelSpacer.getBoundingClientRect();
		homeRect = { left: r.left, top: r.top, width: r.width, height: r.height };
	}

	function lerp(a, b, t) { return a + (b - a) * t; }

	function updateReelProgress() {
		// sub-pages (services.html etc) share this script for the nav/
		// Projects-panel logic but have none of the reel-grow intro
		// markup — skip straight to a simple scroll-distance threshold
		// for revealing the nav instead of touching reelCard/masonry,
		// which would throw on the first null .style write otherwise
		if (!reelCard) {
			// nav is always visible on sub-pages (no intro to scroll
			// through first) — add once, never remove, so it can't
			// flicker off on the next scroll tick
			document.body.classList.add('has-scrolled');
			return;
		}
		fitColumnsToViewport();
		lockCropBase();
		lockMainImgBase();
		lockColumnWidth();
		lockHomeRect();
		const vh = window.innerHeight;
		const vw = window.innerWidth;
		const progress = Math.min(1, Math.max(0, window.scrollY / (vh * 1.05)));
		root.style.setProperty('--reel-progress', progress.toFixed(4));

		// image 2 shrinking (below) pulls scroll-hint's natural layout
		// position up underneath it — tracked here so the push-down
		// transform can cancel that out and land scroll-hint at the
		// same absolute on-screen spot the reference's own curve
		// predicts, regardless of what column 4's images are doing.
		let hintLayoutShift = 0;

		if (mainImgBase && vw >= 800) {
			const PHASE_SPLIT = 0.15; // image 1 (already tiny) finishes collapsing by progress 0.15
			const phaseA = Math.min(1, progress / PHASE_SPLIT);
			const phaseB = Math.max(0, Math.min(1, (progress - PHASE_SPLIT) / (1 - PHASE_SPLIT)));
			const h1 = mainImgBase.h1 * (1 - phaseA);
			const h2 = mainImgBase.h2 * (1 - phaseB);
			mainImg1.style.height = h1.toFixed(1) + 'px';
			// once image 1 is fully gone there's still its normal 16px
			// gap left dangling above image 2 — close that gap down to 0
			// in step with image 1's own shrink, so by the time image 1
			// hits zero, image 2 has slid all the way up flush with the
			// top padding, the same line every other column's first card
			// sits on (not just sitting where image 1 used to end).
			mainImg1.style.marginBottom = (-mainImgBase.gap * phaseA).toFixed(1) + 'px';
			mainImg2.style.height = h2.toFixed(1) + 'px';
			hintLayoutShift = mainImgBase.h2 - h2;
		}

		if (cropBase && vw >= 800) {
			const SWAP_RATIO = 0.5; // first card shrinks to 50% of its rest height by progress 1
			cropBase.forEach(({ first, third }) => {
				if (!first || !third) return;
				const swap = first.h * SWAP_RATIO * progress;
				// no margin trick here on purpose: the gap between every
				// pair of cards (first-second, second-third) must stay the
				// pure, untouched 16px base value the whole time, never
				// inflated to compensate for anything. The second/middle
				// card keeps its own natural height, unmodified. Because
				// first loses exactly what third gains, the column's total
				// height is identical at every point to the resting fit —
				// so it still ends exactly on the bottom padding (the 16px
				// white space top and bottom is never touched either) —
				// the second and third cards simply ride up together by
				// the same amount first shrinks, as one synced unit, with
				// every gap between them reading as a constant 16px.
				first.el.style.height = (first.h - swap).toFixed(1) + 'px';
				third.el.style.height = (third.h + swap).toFixed(1) + 'px';
			});
		}

		if (reelCard && homeRect) {
			// measured directly on the reference (CDP, stable across
			// 20+ scroll ticks): 748px final width at a 1728px viewport,
			// 561px at 1200px — the old 0.72/900 cap was ~20% too wide
			const targetW = Math.min(vw * 0.45, 748);
			const targetH = targetW / (16 / 9);
			const targetLeft = (vw - targetW) / 2;
			const targetTop = (vh - targetH) / 2;

			if (reelLanding) {
				// pulled up by (targetTop - vh), a negative value, so its
				// page position lines up exactly with where the reel
				// freezes once docked (see the docking comment below)
				reelLanding.style.width = targetW.toFixed(1) + 'px';
				reelLanding.style.height = targetH.toFixed(1) + 'px';
				reelLanding.style.marginTop = (targetTop - vh).toFixed(1) + 'px';
			}

			const w = lerp(homeRect.width, targetW, progress);
			const h = lerp(homeRect.height, targetH, progress);
			const left = lerp(homeRect.left, targetLeft, progress);
			const top = lerp(homeRect.top, targetTop, progress);

			reelCard.style.width = w.toFixed(1) + 'px';
			reelCard.style.height = h.toFixed(1) + 'px';
			reelCard.style.left = left.toFixed(1) + 'px';
			// .top is set further below, after the docking offset

			if (scrollHint) {
				// tied directly to the video's own growth (not an
				// independent timer): pushes down by exactly however many
				// px taller the reel has gotten since rest. Never fades
				// (stays opacity 1, see CSS) — just rides down and off
				// .work's own clipped bottom edge as the video grows.
				const pushY = h - homeRect.height;
				scrollHint.style.transform = `translateY(${(pushY + hintLayoutShift).toFixed(1)}px)`;
			}

			// Two separate effects, layered:
			// 1) column 3 (and 5) is pushed by exactly how far the reel's
			//    left (right) edge has moved from rest, so the 16px gap
			//    *between the reel and its immediate neighbor* never
			//    changes.
			// 2) columns further out (2,1 / 6,7) ALSO get progressively
			//    more extra spacing between each other, same as the old
			//    uniform column-gap growth (16px -> 271px) — restoring
			//    the "columns 1,2 drift further out, 6,7 drift further
			//    out" effect, just no longer applied to the boundary
			//    next to the reel.
			if (vw >= 800) {
				const offsetLeft = left - homeRect.left;
				const offsetRight = (left + w) - (homeRect.left + homeRect.width);
				const extra = lerp(16, 271, progress) - 16;
				leftCols.forEach((el) => {
					const distance = parseFloat(getComputedStyle(el).getPropertyValue('--distance'));
					const x = offsetLeft - (distance - 1) * extra;
					el.style.transform = `translateX(${x.toFixed(1)}px)`;
				});
				rightCols.forEach((el) => {
					const distance = parseFloat(getComputedStyle(el).getPropertyValue('--distance'));
					const x = offsetRight + (distance - 1) * extra;
					el.style.transform = `translateX(${x.toFixed(1)}px)`;
				});
			} else {
				leftCols.forEach((el) => { el.style.transform = ''; });
				rightCols.forEach((el) => { el.style.transform = ''; });
			}

			reelCard.classList.toggle('is-ready', progress > 0.85);
			// nav appears exactly when the growth finishes — a hard
			// toggle, not a fade, matching the reference
			document.body.classList.toggle('has-scrolled', progress > 0.9);
			// the Projects panel must never coexist with the reel's own
			// grow animation — the instant that animation is still running
			// (progress hasn't reached a full, settled 1 yet) the panel
			// gets force-closed, every frame, not just on the has-scrolled
			// edge, so there's no window where a click can catch it open
			// mid-growth
			if (progress < 1 && projectsPanel?.classList.contains('is-open')) closeProjectsPanel();

			// Docking: the reel never fades. Instead, once growth is done
			// (progress 1, scrollY past completionY) and the user keeps
			// scrolling, subtract that extra scroll straight out of the
			// fixed `top` value — since position:fixed's top is always
			// viewport-relative, this exactly cancels the viewport's own
			// movement, so the reel's position *on the page* stays frozen
			// at the spot it reached when it finished growing, instead of
			// floating fixed over whatever comes next forever. It reads
			// as "docking" into the page. .reel-landing (an empty spacer
			// right after .work-pin, sized/positioned to land exactly on
			// this same spot) is what gives the document the matching
			// space, so everything after it follows immediately with no
			// gap and nothing overlaps. Pure function of scrollY —
			// nothing is flagged or remembered, so scrolling back up
			// smoothly un-docks it and resumes the normal growth lerp
			// above with no jump either way.
			const completionY = vh * 1.05;
			const dockOffset = Math.max(0, window.scrollY - completionY);
			reelCard.style.top = (top - dockOffset).toFixed(1) + 'px';
		}
	}

	// real modal dialog, not requestFullscreen() — matches what clicking
	// the actual button on the reference opens
	const reelDialog = document.getElementById('reelDialog');
	const reelDialogVideo = document.getElementById('reelDialogVideo');
	const reelDialogClose = document.getElementById('reelDialogClose');
	let lastFocused = null;

	function openReel() {
		if (!reelDialog) return;
		lastFocused = document.activeElement;
		reelDialog.hidden = false;
		reelDialogVideo?.play().catch(() => {});
		reelDialogClose?.focus();
		document.body.style.overflow = 'hidden';
	}
	function closeReel() {
		if (!reelDialog) return;
		reelDialog.hidden = true;
		reelDialogVideo?.pause();
		document.body.style.overflow = '';
		(lastFocused || reelTrigger)?.focus();
	}
	reelDialogClose?.addEventListener('click', closeReel);
	reelDialog?.addEventListener('click', (e) => { if (e.target === reelDialog) closeReel(); });
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && reelDialog && !reelDialog.hidden) closeReel();
	});

	reelTrigger?.addEventListener('click', (e) => { e.stopPropagation(); openReel(); });
	reelCard?.addEventListener('click', () => {
		if (reelCard.classList.contains('is-ready')) openReel();
	});

	const navProjects = document.getElementById('navProjects');
	const projectsPanel = document.getElementById('projectsPanel');
	const projectsPanelClose = document.getElementById('projectsPanelClose');

	function openProjectsPanel() {
		if (!projectsPanel) return;
		projectsPanel.classList.add('is-open');
		projectsPanel.setAttribute('aria-hidden', 'false');
		navProjects?.setAttribute('aria-expanded', 'true');
		document.body.classList.add('projects-panel-open');
		if (location.hash !== '#projects') history.pushState(null, '', '#projects');
		// the cards' ::before hover glow only ever engages on the default
		// (Branding) tab after the user has switched tabs at least once —
		// the one thing a tab switch does that the initial page-load
		// filterProjectsPanel('Branding') call doesn't is actually TOGGLE
		// each card's hidden attribute true->false while the panel is
		// open and visible; the initial call sets hidden=false once,
		// before the panel has ever been opened (while its ancestor still
		// has pointer-events:none / opacity:0). Re-running that same
		// true->false toggle here, after the panel's own entrance
		// transition has genuinely finished, forces the browser through
		// the identical mutation a tab switch does — which is the only
		// thing that's actually been shown to fix it.
		let rewarmed = false;
		function rewarmHover() {
			if (rewarmed) return;
			rewarmed = true;
			projectsPanelCards.forEach((card) => {
				if (!card.hidden) {
					card.hidden = true;
					void card.offsetHeight;
					card.hidden = false;
				}
			});
		}
		projectsPanel.addEventListener('transitionend', function onEnd(e) {
			if (e.target !== projectsPanel) return;
			projectsPanel.removeEventListener('transitionend', onEnd);
			rewarmHover();
		});
		window.setTimeout(rewarmHover, 500); // fallback in case transitionend never fires
	}
	function closeProjectsPanel() {
		if (!projectsPanel) return;
		projectsPanel.classList.remove('is-open');
		projectsPanel.setAttribute('aria-hidden', 'true');
		navProjects?.setAttribute('aria-expanded', 'false');
		document.body.classList.remove('projects-panel-open');
		if (location.hash === '#projects') history.pushState(null, '', location.pathname + location.search);
	}

	projectsPanelClose?.addEventListener('click', (e) => {
		e.stopPropagation();
		closeProjectsPanel();
	});
	navProjects?.addEventListener('click', (e) => {
		e.stopPropagation();
		if (projectsPanel?.classList.contains('is-open')) closeProjectsPanel();
		else openProjectsPanel();
	});
	window.addEventListener('popstate', () => {
		if (location.hash === '#projects') openProjectsPanel();
		else closeProjectsPanel();
	});
	if (location.hash === '#projects') openProjectsPanel();
	document.querySelectorAll('.nav-item').forEach((item) => {
		if (item !== navProjects) item.addEventListener('click', closeProjectsPanel);
	});
	document.addEventListener('click', (e) => {
		if (!projectsPanel?.classList.contains('is-open')) return;
		if (!projectsPanel.contains(e.target) && e.target !== navProjects && !navProjects?.contains(e.target)) {
			closeProjectsPanel();
		}
	});
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && projectsPanel?.classList.contains('is-open')) closeProjectsPanel();
	});
	const projectsPanelCards = Array.from(document.querySelectorAll('#projectsPanel .projects-panel-card'));
	const projectsPanelGrid = document.querySelector('.projects-panel-grid');
	const projectsPanelTabs = Array.from(document.querySelectorAll('.projects-panel-tab'));
	function filterProjectsPanel(tabName) {
		projectsPanelCards.forEach((card) => {
			const tabs = (card.dataset.tabs || '').split(' ');
			card.hidden = !tabs.includes(tabName);
		});
	}
	// slide-through transition on tab switch — matches the reference's
	// own horizontal slider between its per-tab project grids: the
	// current set slides/fades out, the filter swaps the cards while
	// off to the side, then it slides/fades back in from the opposite
	// edge, direction set by whether the new tab is to the left or
	// right of the old one in the tab bar
	const PROJECTS_SLIDE_TRANSITION = 'transform .25s var(--ease), opacity .25s var(--ease)';
	function switchProjectsTab(tab) {
		if (!projectsPanelGrid || tab.classList.contains('is-active')) return;
		const oldIndex = projectsPanelTabs.findIndex((t) => t.classList.contains('is-active'));
		const newIndex = projectsPanelTabs.indexOf(tab);
		const dir = newIndex > oldIndex ? 1 : -1;
		projectsPanelTabs.forEach((t) => t.classList.remove('is-active'));
		tab.classList.add('is-active');
		projectsPanelGrid.style.transition = PROJECTS_SLIDE_TRANSITION;
		projectsPanelGrid.style.transform = `translateX(${-dir * 16}px)`;
		projectsPanelGrid.style.opacity = '0';
		window.setTimeout(() => {
			filterProjectsPanel(tab.dataset.filter || tab.textContent.trim());
			projectsPanelGrid.style.transition = 'none';
			projectsPanelGrid.style.transform = `translateX(${dir * 16}px)`;
			// eslint-disable-next-line no-unused-expressions
			projectsPanelGrid.offsetHeight; // force reflow so the next transform change re-enables transition
			projectsPanelGrid.style.transition = PROJECTS_SLIDE_TRANSITION;
			projectsPanelGrid.style.transform = 'translateX(0)';
			projectsPanelGrid.style.opacity = '1';
		}, 180);
	}
	projectsPanelTabs.forEach((tab) => {
		tab.addEventListener('click', () => switchProjectsTab(tab));
	});
	filterProjectsPanel('Branding');

	let ticking = false;
	window.addEventListener('scroll', () => {
		if (!ticking) {
			requestAnimationFrame(() => {
				updateReelProgress();
				ticking = false;
			});
			ticking = true;
		}
	}, { passive: true });
	updateReelProgress();
	window.addEventListener('load', updateReelProgress);

	// re-measure everything on resize (orientation change, window drag,
	// devtools responsive mode) so the fit, locked column width, and
	// the reel's home rect all stay correct at the new size — true
	// responsiveness, not a one-time fit for whatever size loaded first
	let resizeTimer = null;
	window.addEventListener('resize', () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			gcols.forEach((el) => {
				Array.from(el.children).forEach((card) => {
					card.style.height = '';
					card.style.display = '';
					card.style.marginBottom = '';
				});
				el.style.transform = '';
			});
			if (masonry) masonry.style.gridTemplateColumns = '';
			columnsFitted = false;
			cropBase = null;
			mainImgBase = null;
			lockedColWidth = null;
			homeRect = null;
			updateReelProgress();
		}, 150);
	});

	/* ===== skip-intro hint: jump past the crossfade ===== */
	document.getElementById('scrollHint')?.addEventListener('click', () => {
		window.scrollTo({ top: window.innerHeight * 0.9, behavior: 'smooth' });
	});

	/* ===== services page: TOC active-section tracking ===== */
	const svcToc = document.getElementById('svcTocList');
	if (svcToc) {
		const svcLinks = Array.from(svcToc.querySelectorAll('a'));
		const svcSections = svcLinks
			.map((a) => document.getElementById(a.getAttribute('href').slice(1)))
			.filter(Boolean);
		// root: .svc-main on desktop — the content column scrolls inside
		// itself (a fixed-height card, matching the reference) rather
		// than the document scrolling, so the observer has to watch that
		// container instead of the default viewport or it never fires
		const svcObserver = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (!entry.isIntersecting) return;
					const id = entry.target.id;
					svcLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${id}`));
				});
			},
			{ root: document.querySelector('.svc-main'), rootMargin: '-10% 0px -70% 0px' }
		);
		svcSections.forEach((sec) => svcObserver.observe(sec));
	}

	/* ===== services page: scroll-linked overlay gradient ===== */
	// --grad-end is the % down the page where .svc-scroll-gradient reaches
	// full solid darkness (see style.css). Sits lower at rest (more of the
	// fixed hero photo stays visible) and migrates upward as the user
	// scrolls, so the darkening point itself transitions rather than
	// staying pinned to a fixed percentage.
	// .proj-detail-frame (project detail pages only) is the actual
	// scroll container there now, not .svc-main — .svc-main is
	// overflow:hidden on those pages since the frame needs to stay a
	// fixed-size inset "paper on paper" regardless of scroll position,
	// which a margin on the scrolling content itself can't do. Falls
	// back to .svc-main on every other proj-page, unchanged.
	const svcMain = document.querySelector('.proj-detail-frame') || document.querySelector('.svc-main');
	if (svcMain) {
		const GRAD_START = 30;
		const GRAD_END = 10;
		const GRAD_SCROLL_RANGE = 1200;
		const updateGradEnd = () => {
			const progress = Math.min(1, svcMain.scrollTop / GRAD_SCROLL_RANGE);
			const value = GRAD_START - (GRAD_START - GRAD_END) * progress;
			svcMain.style.setProperty('--grad-end', `${value}%`);
		};
		updateGradEnd();
		svcMain.addEventListener('scroll', updateGradEnd, { passive: true });
	}

	/* ===== projects page: sticky header background on scroll ===== */
	// transparent over the hero at rest, so the hero media reads cleanly;
	// solidifies gradually over HEADER_FADE_RANGE px of scroll (not a
	// snap past a fixed threshold) via --header-progress, read by the
	// header's own background/border/backdrop-filter in CSS
	const projHeader = document.querySelector('.proj-hero-header');
	if (projHeader && svcMain) {
		const HEADER_FADE_RANGE = 200;
		const HEADER_FADE_DEADZONE = .25;
		const updateProjHeaderScrolled = () => {
			const raw = Math.min(1, svcMain.scrollTop / HEADER_FADE_RANGE);
			const progress = raw <= HEADER_FADE_DEADZONE ? 0 : (raw - HEADER_FADE_DEADZONE) / (1 - HEADER_FADE_DEADZONE);
			projHeader.style.setProperty('--header-progress', progress);
		};
		updateProjHeaderScrolled();
		svcMain.addEventListener('scroll', updateProjHeaderScrolled, { passive: true });
	}

	/* ===== project detail page: hero fills the frame's own viewport ===== */
	// reference's hero is h-svh — exactly one viewport tall. Our
	// equivalent "viewport" is .proj-detail-frame (inset, fixed-size),
	// not the browser window, so svh/vh units would overshoot it. A
	// percentage height can't resolve here either (.svc-scroll-inner,
	// the hero's parent, has no definite height of its own — it grows
	// to fit its content, same class of issue the gallery media sizing
	// hit earlier) — so the frame's real pixel height is measured in
	// JS and written to a custom property instead.
	const projDetailFrame = document.querySelector('.proj-detail-frame');
	if (projDetailFrame) {
		const updateFrameHeight = () => {
			projDetailFrame.style.setProperty('--frame-vh', `${projDetailFrame.clientHeight}px`);
		};
		updateFrameHeight();
		window.addEventListener('resize', updateFrameHeight);
	}

	/* ===== project detail page: hero/intro text fades + pinned photo ===== */
	// Ground truth re-captured from scratch via real mouse-wheel scroll
	// screenshots of the live reference at 50px steps (0–1400), because
	// DOM computed-style reads were actively lying: the text nodes
	// matched by querySelector reported opacity:"1" at every single
	// scrollTop even though the screenshots clearly show them fading —
	// the reference renders these through something (likely a canvas or
	// mask layer) that never surfaces as element.style/computedStyle
	// opacity. Pixels are the only reliable signal here. What the
	// screenshots actually show:
	//  - title block: opacity 1 until scrollTop ≈0.13×frame height,
	//    linear fade to 0 by ≈0.31×frame height. It also visibly moves
	//    upward with scroll, but that's just it being normal in-flow
	//    content — no JS transform needed, only opacity.
	//  - intro paragraph: invisible at rest, fades 0→1 between ≈0.10
	//    and 0.31×frame height (overlapping the title's own fade-out,
	//    not waiting for it), HOLDS at full opacity+static position
	//    while the background finishes going solid, then fades 1→0
	//    between ≈0.67 and 0.82×frame height as the gallery takes over.
	//    Same deal — plain document flow, opacity-only.
	//  - background: starts as the photo, scrim ramps 0→1 (solid
	//    near-black) by ≈0.43×frame height. This used to be a constant
	//    .78 opacity the whole time, which is why "fade to solid color"
	//    never actually happened for us — now it's scroll-driven.
	//  - gallery's first slide + thumbnail rail: invisible until
	//    ≈0.62×frame height, fades in to full brightness by ≈0.80×frame
	//    height, already sitting in its final framed/inset position the
	//    entire time (opacity-only reveal, no "traveling into place").
	const projDetailHero = document.querySelector('.proj-detail-hero');
	const projDetailHeroContent = document.querySelector('.proj-detail-hero-content');
	const projDetailHeroBg = document.querySelector('.proj-detail-hero-bg');
	const projDetailIntroText = document.querySelector('.proj-detail-intro-text');
	if (projDetailHero && projDetailHeroContent && svcMain) {
		const frameHeight = () => (projDetailFrame ? projDetailFrame.clientHeight : svcMain.clientHeight) || 974;
		const fade = (scrollTop, startFrac, endFrac, fh) => {
			const start = fh * startFrac, end = fh * endFrac;
			return Math.min(1, Math.max(0, (scrollTop - start) / (end - start)));
		};
		const HERO_FADE_START = .154, HERO_FADE_END = .30;
		const INTRO_IN_START = .148, INTRO_IN_END = .44;
		const INTRO_OUT_START = .60, INTRO_OUT_END = .84;
		const SCRIM_END = .45;
		// reference keeps a visible dark vignette even at rest (scrollTop
		// 0) — a side-by-side of the two rest-state screenshots showed
		// ours noticeably brighter/more saturated without it. Scrim isn't
		// 0→1, it's SCRIM_BASE→1.
		const SCRIM_BASE = .32;
		const updateHeroIntroFade = () => {
			const fh = frameHeight();
			const y = svcMain.scrollTop;
			projDetailHeroContent.style.opacity = String(1 - fade(y, HERO_FADE_START, HERO_FADE_END, fh));
			if (projDetailHeroBg) {
				projDetailHeroBg.style.setProperty('--scrim', String(SCRIM_BASE + (1 - SCRIM_BASE) * fade(y, 0, SCRIM_END, fh)));
			}
			if (projDetailIntroText) {
				const fadeIn = fade(y, INTRO_IN_START, INTRO_IN_END, fh);
				const fadeOut = fade(y, INTRO_OUT_START, INTRO_OUT_END, fh);
				projDetailIntroText.style.opacity = String(fadeIn - fadeOut);
			}
		};
		updateHeroIntroFade();
		svcMain.addEventListener('scroll', updateHeroIntroFade, { passive: true });

		/* gallery's first slide + rail fade in as intro fades out. */
		const firstGallerySlide = document.querySelector('#gslide-0 .proj-gallery-media');
		if (firstGallerySlide) {
			const GALLERY_FADE_START = .64, GALLERY_FADE_END = .81;
			const galleryRail = document.querySelector('.proj-gallery-rail');
			const updateFirstSlideFade = () => {
				const progress = fade(svcMain.scrollTop, GALLERY_FADE_START, GALLERY_FADE_END, frameHeight());
				firstGallerySlide.style.opacity = String(progress);
				if (galleryRail) galleryRail.style.opacity = String(progress);
			};
			updateFirstSlideFade();
			svcMain.addEventListener('scroll', updateFirstSlideFade, { passive: true });
		}
	}

	/* ===== project detail page: gallery thumbnail rail sync ===== */
	// IntersectionObserver watches each sticky-stack row (not the gallery
	// container itself, which spans ~5.5x viewport height) — whichever
	// row crosses the vertical center of .svc-main's viewport is "active",
	// matching which slide actually reads as current while it's pinned
	const galleryRail = document.querySelector('.proj-gallery-rail');
	if (galleryRail && svcMain) {
		const thumbs = Array.from(galleryRail.querySelectorAll('.proj-gallery-thumb'));
		const rows = Array.from(document.querySelectorAll('.proj-gallery-row'));
		const progressBar = document.querySelector('.proj-gallery-progress');
		const setActive = (id) => {
			thumbs.forEach(t => t.classList.toggle('is-active', t.dataset.slide === id));
			// crossfades the incoming slide's own media in via CSS
			// (.proj-gallery-media opacity transition) instead of the
			// sticky-stack's plain z-order cut — reference does the same
			// handoff as an opacity cross-fade between slides, not a cut
			rows.forEach(r => r.classList.toggle('is-active', r.id === id));
			if (progressBar) {
				const index = thumbs.findIndex(t => t.dataset.slide === id);
				if (index >= 0 && thumbs.length > 1) {
					// (100% - bar height) so the bar's bottom edge never
					// slides past the rail's own bottom edge, same idea as
					// the reference's own top:[--scroll-progress] minimap
					const fraction = index / (thumbs.length - 1);
					progressBar.style.top = `calc((100% - .2rem) * ${fraction})`;
				}
			}
		};
		const observer = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) setActive(entry.target.id);
			});
		}, { root: svcMain, rootMargin: '-50% 0px -50% 0px', threshold: 0 });
		rows.forEach(row => observer.observe(row));

		thumbs.forEach(thumb => {
			thumb.addEventListener('click', () => {
				const row = document.getElementById(thumb.dataset.slide);
				row?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			});
		});
	}

	/* ===== services page: share/copy widget ===== */
	const navCopy = document.getElementById('navCopy');
	const navShare = document.getElementById('navShare');
	const navShareMenu = document.getElementById('navShareMenu');

	navCopy?.addEventListener('click', async () => {
		try {
			await navigator.clipboard.writeText(location.href);
		} catch (e) {
			/* clipboard API unavailable — tip still shows, just a no-op copy */
		}
		const tip = navCopy.querySelector('.svc-copy-tip');
		if (tip) tip.innerHTML = '<svg class="svc-copy-tip-check" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4.5" stroke="#4ADE80" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Link copied!';
		navCopy.classList.add('is-copied');
		window.setTimeout(() => {
			navCopy.classList.remove('is-copied');
			if (tip) tip.textContent = 'Copy';
		}, 2000);
	});

	navShare?.addEventListener('click', (e) => {
		e.stopPropagation();
		const isOpen = !navShareMenu.hidden;
		navShareMenu.hidden = isOpen;
		navShare.setAttribute('aria-expanded', String(!isOpen));
	});
	document.addEventListener('click', (e) => {
		if (!navShareMenu || navShareMenu.hidden) return;
		if (!navShareMenu.contains(e.target) && e.target !== navShare && !navShare?.contains(e.target)) {
			navShareMenu.hidden = true;
			navShare?.setAttribute('aria-expanded', 'false');
		}
	});
	document.querySelectorAll('.svc-share-item').forEach((item) => {
		item.addEventListener('click', (e) => {
			e.preventDefault();
			const url = encodeURIComponent(location.href);
			const title = encodeURIComponent(document.title);
			const targets = {
				facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
				linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
				x: `https://twitter.com/intent/tweet?url=${url}&text=${title}`,
				email: `mailto:?subject=${title}&body=${url}`,
			};
			const target = targets[item.dataset.share];
			if (!target) return;
			if (item.dataset.share === 'email') window.location.href = target;
			else window.open(target, '_blank', 'noopener,noreferrer,width=600,height=600');
			navShareMenu.hidden = true;
			navShare?.setAttribute('aria-expanded', 'false');
		});
	});

	/* ===== hire page: conversational intake form ===== */
	// no backend on this site, so the actual delivery runs through
	// FormSubmit.co's ajax endpoint — a free, no-signup, frontend-only
	// POST target that forwards the JSON body as an email. The very
	// first submission to a new recipient address triggers a one-time
	// "confirm this form" email FormSubmit sends that address; until
	// that's clicked, submissions are accepted but not delivered.
	const hireThread = document.getElementById('hireThread');
	if (hireThread) {
		const hireForm = document.getElementById('hireForm');
		const hireInput = document.getElementById('hireInput');
		const hireOk = hireForm.querySelector('.hire-ok');
		const hireSuggestions = document.getElementById('hireSuggestions');
		const answers = {};

		const addMsg = (text, cls) => {
			const el = document.createElement('div');
			el.className = `hire-msg ${cls}`;
			el.textContent = text;
			hireThread.appendChild(el);
			el.scrollIntoView({ block: 'end', behavior: 'smooth' });
			return el;
		};
		const wait = (ms) => new Promise(r => setTimeout(r, ms));
		const sayBot = async (text) => { await wait(500); addMsg(text, 'hire-msg-bot'); await wait(300); };
		const sayMe = (text) => addMsg(text, 'hire-msg-me');

		const askInput = ({ placeholder, type = 'text', suggestions = [] }) => {
			hireInput.value = '';
			hireInput.type = type;
			hireInput.placeholder = placeholder;
			hireSuggestions.innerHTML = '';
			if (suggestions.length) {
				hireInput.setAttribute('list', 'hireSuggestions');
				suggestions.forEach(s => {
					const opt = document.createElement('option');
					opt.value = s;
					hireSuggestions.appendChild(opt);
				});
			} else {
				hireInput.removeAttribute('list');
			}
			hireForm.hidden = false;
			hireInput.focus();
			return new Promise((resolve) => {
				const onSubmit = (e) => {
					e.preventDefault();
					const val = hireInput.value.trim();
					if (!val) return;
					hireForm.removeEventListener('submit', onSubmit);
					hireForm.hidden = true;
					resolve(val);
				};
				hireForm.addEventListener('submit', onSubmit);
			});
		};

		const run = async () => {
			hireForm.hidden = true;
			const hour = new Date().getHours();
			const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
			const emoji = hour < 12 ? '🌤️' : hour < 18 ? '☀️' : '🌝';

			await sayBot(`Good ${timeOfDay}! ${emoji}`);
			await sayBot("I'm Saket 👋");
			await wait(300);
			sayMe('👋');
			await wait(400);
			sayMe('Nice to meet you!');
			await wait(600);

			await sayBot('The pleasure is all mine. What should I call you?');
			answers.name = await askInput({ placeholder: 'Paul McCartney' });
			sayMe(answers.name);

			await sayBot(`Nice to meet you, ${answers.name}.`);
			await sayBot("And what do you do?");
			answers.role = await askInput({ placeholder: 'Product Designer' });
			sayMe(answers.role);

			await sayBot("What's the best email to reach you at?");
			answers.email = await askInput({ placeholder: 'you@email.com', type: 'email' });
			sayMe(answers.email);

			await sayBot('How may I help you today?');
			answers.project = await askInput({
				placeholder: 'Creating a new website',
				suggestions: ['Building a new brand', 'A rebranding', 'A campaign', 'A website redesign', 'Creating a new website'],
			});
			sayMe(answers.project);

			await sayBot('Tell me a little more about it — timeline, budget, anything useful.');
			answers.details = await askInput({ placeholder: 'A few sentences about your project...' });
			sayMe(answers.details);

			await sayBot("Perfect — sending this over to Saket now.");
			await wait(400);

			try {
				const res = await fetch('https://formsubmit.co/ajax/saketraushan2208@gmail.com', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
					body: JSON.stringify({
						_subject: `New project inquiry from ${answers.name}`,
						Name: answers.name,
						Role: answers.role,
						Email: answers.email,
						'Looking for': answers.project,
						Details: answers.details,
					}),
				});
				if (!res.ok) throw new Error(`status ${res.status}`);
				await sayBot(`Got it, ${answers.name} — I'll be in touch at ${answers.email} shortly. Thanks for reaching out! 🙌`);
			} catch (err) {
				await sayBot(`Hmm, that didn't send (${err.message}). Mind emailing me directly at saketraushan2208@gmail.com instead?`);
			}
		};

		run();
	}

	/* ===== contact page: live Gurugram clock ===== */
	const contactHour = document.getElementById('contactHour');
	const contactMinute = document.getElementById('contactMinute');
	if (contactHour && contactMinute) {
		const updateClock = () => {
			const parts = new Intl.DateTimeFormat('en-GB', {
				timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
			}).formatToParts(new Date());
			contactHour.textContent = parts.find(p => p.type === 'hour').value;
			contactMinute.textContent = parts.find(p => p.type === 'minute').value;
		};
		updateClock();
		setInterval(updateClock, 10000);
	}

	/* ===== contact page: "how to say my name" pronunciation ===== */
	// no recorded audio clip exists for this, so this uses the browser's
	// own speech synthesis rather than faking a sound file that isn't real
	const contactSoundBtn = document.getElementById('contactSoundBtn');
	if (contactSoundBtn && 'speechSynthesis' in window) {
		// voices load async and are often still an empty list on the very
		// first speak() call right after page load (a well-known Chrome
		// quirk) — calling getVoices() once up front, and again on the
		// voiceschanged event, warms the list so the first click actually
		// produces audio instead of silently no-op'ing
		let voices = window.speechSynthesis.getVoices();
		window.speechSynthesis.addEventListener('voiceschanged', () => {
			voices = window.speechSynthesis.getVoices();
		});
		const speakName = () => {
			window.speechSynthesis.cancel();
			const utter = new SpeechSynthesisUtterance('Saket Raushan');
			utter.rate = .9;
			const enVoice = voices.find(v => v.lang && v.lang.startsWith('en'));
			if (enVoice) utter.voice = enVoice;
			window.speechSynthesis.speak(utter);
		};
		contactSoundBtn.addEventListener('click', speakName);
	}
})();
