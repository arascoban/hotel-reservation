import ReservationForm from '@/components/Reservations/ReservationForm'

interface Props {
  searchParams: Promise<{ room_id?: string; checkin?: string; checkout?: string }>
}

export default async function NewReservationPage({ searchParams }: Props) {
  const { room_id, checkin, checkout } = await searchParams

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Neue Reservierung</h1>
        <p className="text-slate-500 mt-1">Reservierung manuell erfassen.</p>
      </div>

      <ReservationForm
        defaultRoomId={room_id}
        defaultCheckin={checkin}
        defaultCheckout={checkout}
      />
    </div>
  )
}
