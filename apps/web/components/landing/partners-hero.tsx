"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { translations, type Locale } from "@/lib/translations"

const products = [
  { src: "/brand/hero-products/product-01.png" },
  { src: "/brand/hero-products/product-02.png" },
  { src: "/brand/hero-products/product-03.png" },
  { src: "/brand/hero-products/product-04.png" },
  { src: "/brand/hero-products/product-05.png" },
  { src: "/brand/hero-products/product-06.png" },
]

const initialVisible = [0, 1, 2]
const initialPool = [3, 4, 5]

type RotationState = {
  visible: number[]
  pool: number[]
  nextSlot: number
}

function shuffle(values: number[]) {
  const pool = [...values]

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = pool[index]
    pool[index] = pool[randomIndex]
    pool[randomIndex] = current
  }

  return pool
}

function getNextRotation(current: RotationState): RotationState {
  const slot = current.nextSlot
  const pool = slot === 0 ? shuffle(current.pool) : [...current.pool]
  const nextProduct = pool.shift()

  if (nextProduct === undefined) {
    return current
  }

  const visible = [...current.visible]
  const previousProduct = visible[slot]
  visible[slot] = nextProduct
  pool.push(previousProduct)

  return {
    visible,
    pool,
    nextSlot: (slot + 1) % visible.length,
  }
}

function HeroProduct({ productIndex, slot, alt }: { productIndex: number; slot: number; alt: string }) {
  const product = products[productIndex]

  return (
    <span className="hero-product-float inline-flex shrink-0 items-center justify-center" data-hero-float>
      <Image
        key={`${product.src}-${slot}`}
        src={product.src}
        alt={alt}
        width={104}
        height={104}
        loading="eager"
        sizes="(min-width: 768px) 104px, 64px"
        className="hero-image-slot size-16 shrink-0 rounded-2xl object-cover sm:size-[104px] sm:rounded-3xl"
      />
    </span>
  )
}

export default function PartnersHero({ locale }: { locale: Locale }) {
  const copy = translations[locale]
  const [rotation, setRotation] = useState<RotationState>({ visible: initialVisible, pool: initialPool, nextSlot: 0 })
  const order = rotation.visible

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRotation((current) => getNextRotation(current))
    }, 1500)

    return () => window.clearInterval(intervalId)
  }, [])

  return (
    <section className="bg-[#fdfdfd] text-[#050505]" id="hero">
      <div className="mx-auto flex min-h-[780px] w-full max-w-[1440px] flex-col items-center px-5 pb-28 pt-12 text-center sm:px-8 sm:pt-[120px] lg:px-12">
        <span data-scroll-reveal className="inline-flex items-center rounded-full bg-[#f2f2f2] px-4 py-2 text-sm font-medium leading-[1.4] tracking-[-0.01em] text-[#404040] sm:px-[22px] sm:py-[10px] sm:text-base">
          {copy.hero.badge}
        </span>

        <h1 data-scroll-reveal className="mt-8 max-w-[1320px] text-[clamp(36px,9.2vw,48px)] font-medium leading-[0.98] tracking-[-0.055em] sm:mt-12 sm:text-[clamp(48px,5vw,80px)] sm:leading-[1.08]">
          <span className="sm:hidden">
            <span className="block">{copy.hero.firstLine}</span>
            <span className="mt-1 flex items-center justify-center gap-3">
              <HeroProduct productIndex={order[1]} slot={1} alt={copy.hero.altProducts[order[1]]} />
              <span>{copy.hero.brand}</span>
            </span>
            <span className="mt-1 flex items-center justify-center gap-3">
              <HeroProduct productIndex={order[0]} slot={0} alt={copy.hero.altProducts[order[0]]} />
              <span>{copy.hero.thirdLine}</span>
            </span>
            <span className="mt-1 flex items-center justify-center gap-3">
              <span>{copy.hero.fourthLine}</span>
              <HeroProduct productIndex={order[2]} slot={2} alt={copy.hero.altProducts[order[2]]} />
            </span>
          </span>
          <span className="hidden items-center justify-center gap-3 sm:flex">
            <HeroProduct productIndex={order[0]} slot={0} alt={copy.hero.altProducts[order[0]]} />
            <span>{copy.hero.firstLine}</span>
            <HeroProduct productIndex={order[1]} slot={1} alt={copy.hero.altProducts[order[1]]} />
            <span>{copy.hero.brand}</span>
            <HeroProduct productIndex={order[2]} slot={2} alt={copy.hero.altProducts[order[2]]} />
          </span>
          <span className="hidden sm:block">{copy.hero.lastLine}</span>
        </h1>

        <p data-scroll-reveal className="mt-9 hidden max-w-[850px] text-base leading-[1.5] tracking-[-0.02em] text-[#525252] sm:mt-11 sm:block sm:text-2xl sm:tracking-[-0.025em]">
          {copy.hero.subtitle}
        </p>
        <p data-scroll-reveal className="mt-9 max-w-[340px] text-base leading-[1.5] tracking-[-0.02em] text-[#525252] sm:hidden">
          {copy.hero.subtitle}
        </p>

        <div data-scroll-stagger className="mt-9 flex w-full max-w-[560px] flex-col gap-3 sm:mt-12 sm:w-auto sm:max-w-none sm:flex-row sm:gap-4">
          <Link data-scroll-stagger-item href="/apply" className="inline-flex h-[52px] w-full items-center justify-center rounded-full bg-[#050505] px-10 text-base font-medium leading-[1.5] tracking-[-0.01em] text-white transition-opacity hover:opacity-85 sm:h-14 sm:w-auto">
            {copy.hero.becomePartner}
          </Link>
          <a data-scroll-stagger-item href="#program" className="inline-flex h-[52px] w-full items-center justify-center rounded-full bg-[#e5e5e5] px-10 text-base font-medium leading-[1.5] tracking-[-0.01em] text-[#404040] transition-colors hover:bg-[#dadada] sm:h-14 sm:w-auto">
            {copy.hero.learnMore}
          </a>
        </div>

      </div>
    </section>
  )
}
