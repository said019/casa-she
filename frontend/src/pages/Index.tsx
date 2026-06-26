import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Schedule from "@/components/Schedule";
import ClassTypes from "@/components/ClassTypes";
import Instructors from "@/components/Instructors";
import Pricing from "@/components/Pricing";
import Testimonials from "@/components/Testimonials";
import StudioGallery from "@/components/StudioGallery";
import Location from "@/components/Location";
import Footer from "@/components/Footer";
import { Reveal } from "@/components/Reveal";

const Index = () => {
  return (
    <main className="landing-sans min-h-screen bg-bmb-cream">
      <Navbar />
      <Hero />
      <Reveal><Schedule /></Reveal>
      <Reveal><ClassTypes /></Reveal>
      <Reveal><Instructors /></Reveal>
      <Reveal><Pricing /></Reveal>
      <Reveal><Testimonials /></Reveal>
      <Reveal><StudioGallery /></Reveal>
      <Reveal><Location /></Reveal>
      <Footer />
    </main>
  );
};

export default Index;
