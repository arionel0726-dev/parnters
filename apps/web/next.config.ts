import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
	output: 'standalone',
	outputFileTracingRoot: path.join(__dirname, '../..'),
	transpilePackages: ['@vizaje/contracts'],
	distDir: process.env.NEXT_DIST_DIR ?? '.next',
	// The Next.js devtools overlay can throw releasePointerCapture errors in Chrome
	// while interacting with the mobile viewport. Keep compile/runtime errors visible
	// without mounting the unstable route indicator UI.
	devIndicators: false,
	logging: {
		incomingRequests: {
			ignore: [/\/activate(?:\?.*)?$/]
		}
	},
	turbopack: {
		root: path.resolve(__dirname, '../..')
	}
}

export default nextConfig
