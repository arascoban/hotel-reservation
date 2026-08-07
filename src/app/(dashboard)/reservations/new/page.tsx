import NewReservationTabs from './NewReservationTabs'

interface Props {
  searchParams: Promise<{ room_id?: string; checkin?: string; checkout?: string }>
}

export default async function NewReservationPage({ searchParams }: Props) {
  const { room_id, checkin, checkout } = await searchParams

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Neue Reservierung</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Einzelne Buchung oder eine Gruppe über mehrere Zimmer erfassen.
        </p>
      </div>

      <NewReservationTabs
        defaultRoomId={room_id}
        defaultCheckin={checkin}
        defaultCheckout={checkout}
      />
    </div>
  )
}
