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
	const projectsPanelCards = Array.from(document.querySelectorAll('.projects-panel-card'));
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
})();
