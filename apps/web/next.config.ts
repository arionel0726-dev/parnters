import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
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
