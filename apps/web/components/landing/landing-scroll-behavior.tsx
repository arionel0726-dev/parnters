"use client"

import { useEffect } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import Lenis from "lenis"

export default function LandingScrollBehavior() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)

    const lenis = new Lenis({
      anchors: true,
      lerp: 0.12,
      respectReducedMotion: true,
      smoothWheel: true,
      stopInertiaOnNavigate: true,
      wheelMultiplier: 0.96,
    })
    const unsubscribeFromLenis = lenis.on("scroll", ScrollTrigger.update)
    const updateLenis = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(updateLenis)

    const canAnimate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const context = gsap.context(() => {
      if (!canAnimate) {
        return
      }

      gsap.utils.toArray<HTMLElement>("[data-hero-float]").forEach((item, index) => {
        gsap.to(item, {
          y: index % 2 === 0 ? -5 : 5,
          rotation: index % 2 === 0 ? 0.8 : -0.8,
          duration: 3.6 + (index % 3) * 0.35,
          delay: index * 0.15,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        })
      })

      gsap.utils.toArray<HTMLElement>("[data-scroll-reveal]").forEach((element) => {
        gsap.from(element, {
          y: 24,
          autoAlpha: 0.45,
          duration: 0.95,
          ease: "power3.out",
          scrollTrigger: {
            trigger: element,
            start: "top 86%",
            once: true,
          },
        })
      })

      gsap.utils.toArray<HTMLElement>("[data-scroll-stagger]").forEach((group) => {
        const items = group.querySelectorAll<HTMLElement>("[data-scroll-stagger-item]")

        if (!items.length) {
          return
        }

        gsap.from(items, {
          y: 28,
          scale: 0.99,
          autoAlpha: 0.45,
          duration: 1,
          stagger: 0.15,
          ease: "power3.out",
          scrollTrigger: {
            trigger: group,
            start: "top 82%",
            once: true,
          },
        })
      })

      const communityTitleTone = document.querySelector<HTMLElement>("[data-scroll-tone]")

      if (communityTitleTone) {
        gsap.fromTo(
          communityTitleTone,
          { color: "#a3a3a3" },
          {
            color: "#1d1d1d",
            ease: "none",
            scrollTrigger: {
              trigger: communityTitleTone,
              start: "top 82%",
              end: "top 54%",
              scrub: 0.6,
            },
          },
        )
      }

      gsap.utils.toArray<HTMLElement>("[data-community-parallax]").forEach((card, index) => {
        const distance = index === 1 ? 16 : -12

        gsap.fromTo(
          card,
          { y: distance },
          {
            y: -distance,
            ease: "none",
            scrollTrigger: {
              trigger: card.parentElement ?? card,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.7,
            },
          },
        )
      })

      const wordmarkStage = document.querySelector<HTMLElement>("[data-footer-wordmark]")
      const wordmarkLetters = wordmarkStage?.querySelectorAll<HTMLElement>(".footer-wordmark-letter")

      if (wordmarkStage && wordmarkLetters?.length) {
        gsap.fromTo(
          wordmarkLetters,
          { yPercent: 120, autoAlpha: 0 },
          {
            yPercent: 0,
            autoAlpha: 1,
            duration: 1,
            stagger: 0.12,
            ease: "power3.out",
            scrollTrigger: {
              trigger: wordmarkStage,
              start: "top 88%",
              once: true,
            },
          },
        )
      }
    })

    ScrollTrigger.refresh()

    return () => {
      context.revert()
      gsap.ticker.remove(updateLenis)
      unsubscribeFromLenis()
      lenis.destroy()
    }
  }, [])

  return null
}
