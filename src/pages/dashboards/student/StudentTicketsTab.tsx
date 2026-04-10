import { PddExamTicketsTab } from "@/components/PddExamTicketsTab";

export function StudentTicketsTab() {
  return (
    <div className="admin-tab student-tickets-tab">
      <h1 className="admin-tab-title">Билеты</h1>
      <PddExamTicketsTab />
    </div>
  );
}
