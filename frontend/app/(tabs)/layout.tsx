import BottomNav from "@/components/BottomNav";
import FxLayer from "@/components/FxLayer";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Celular: una columna de 430 px. Desde 768 px: al lado de la barra lateral, más ancho. */}
      <main className="pt-safe relative mx-auto min-h-dvh w-full max-w-[430px] px-5 pb-[calc(140px+env(safe-area-inset-bottom))] md:ml-[248px] md:mr-0 md:w-auto md:max-w-none md:px-8 md:pb-12 md:pt-8 lg:px-12">
        <div className="md:mx-auto md:max-w-[1120px]">{children}</div>
      </main>
      <BottomNav />
      <FxLayer />
    </>
  );
}
