import { useReveal } from "./hooks/useReveal";
import { useIsMobile } from "./hooks/useIsMobile";
import { Navbar } from "./components/Navbar";
import { Hero } from "./components/Hero";
import { Marquee } from "./components/Marquee";
import { About } from "./components/About";
import { MenuSection } from "./components/MenuSection";
import { Concept } from "./components/Concept";
import { Gallery } from "./components/Gallery";
import { Reviews } from "./components/Reviews";
import { OrderCta } from "./components/OrderCta";
import { Location } from "./components/Location";
import { Footer } from "./components/Footer";
import { MobileBar } from "./components/MobileBar";
import { ScrollProgress } from "./components/ScrollProgress";
import { BackToTop } from "./components/BackToTop";

export default function App() {
  const ref = useReveal<HTMLDivElement>();
  const isMobile = useIsMobile();

  return (
    <div ref={ref} className="min-h-screen bg-cream">
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>
      <ScrollProgress />
      <Navbar isMobile={isMobile} />
      <main id="contenu">
        <Hero />
        {/* Site épuré sur téléphone (demande du gérant) : les sections
            décoratives disparaissent, l'essentiel reste — commander, la carte,
            les avis, nous trouver. Desktop : tout est là, comme avant. */}
        {!isMobile && <Marquee />}
        <About />
        <MenuSection />
        {!isMobile && <Concept />}
        <Gallery isMobile={isMobile} />
        <Reviews />
        <OrderCta />
        <Location />
      </main>
      <Footer isMobile={isMobile} />
      <MobileBar />
      <BackToTop />
    </div>
  );
}
