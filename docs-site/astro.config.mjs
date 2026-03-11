// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://diascope.biolytics.ai',
	integrations: [
		starlight({
			title: 'DiaScope Docs',
			description: 'Narrated D2 diagrams turned into self-contained interactive HTML stories.',
			logo: {
				src: './src/assets/Logo-05.svg',
				alt: 'Biolytics AI',
			},
			favicon: '/favicon.svg',
			customCss: ['./src/styles/custom.css'],
			credits: false,
			head: [
				{ tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
				{
					tag: 'link',
					attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true },
				},
				{
					tag: 'link',
					attrs: {
						rel: 'stylesheet',
						href:
							'https://fonts.googleapis.com/css2?family=Ubuntu:wght@300;400;500;700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
					},
				},
			],
			components: {
				Footer: './src/components/Footer.astro',
				SiteTitle: './src/components/SiteTitle.astro',
			},
			social: [
				{ icon: 'github', label: 'DiaScope on GitHub', href: 'https://github.com/Biolytics-AI/DiaScope' },
				{ icon: 'external', label: 'Biolytics AI', href: 'https://www.biolytics.ai' },
			],
			sidebar: [
				{
					label: 'Start Here',
					items: [
						{ label: 'Overview', slug: '' },
						{ label: 'Getting Started', slug: 'getting-started' },
						{ label: 'AI Agents', slug: 'guides/ai-agents' },
						{ label: 'Authoring Stories', slug: 'guides/authoring-stories' },
					],
				},
				{
					label: 'Examples',
					items: [{ label: 'Compliant GPU Blueprint', slug: 'examples/vllm-deployment' }],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'CLI', slug: 'reference/cli' },
						{ label: 'Interactive Features', slug: 'reference/interactive-features' },
						{ label: 'Story Format', slug: 'reference/story-format' },
						{ label: 'JavaScript API', slug: 'reference/javascript-api' },
					],
				},
			],
		}),
	],
});
