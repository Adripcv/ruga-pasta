import { useReveal } from "./hooks/useReveal";
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

  return (
    <div ref={ref} className="min-h-screen bg-cream">
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>
      <ScrollProgress />
      <Navbar />
      <main id="contenu">
        <Hero />
        <Marquee />
        <About />
        <MenuSection />
        <Concept />
        <Gallery />
        <Reviews />
        <OrderCta />
        <Location />
      </main>
      <Footer />
      <MobileBar />
      <BackToTop />
    </div>
  );
}
