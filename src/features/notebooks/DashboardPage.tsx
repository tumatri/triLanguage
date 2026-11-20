import { useNavigate } from 'react-router-dom';

export default function DashboardPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Bảng điều khiển</h2>
        <p className="text-gray-500 mt-1">Tổng quan tiến độ học tập</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <div className="text-3xl font-bold text-blue-600">—</div>
          <div className="text-sm text-gray-500 mt-1">Tổng thẻ</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <div className="text-3xl font-bold text-yellow-600">—</div>
          <div className="text-sm text-gray-500 mt-1">Đến hạn ôn</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <div className="text-3xl font-bold text-green-600">—</div>
          <div className="text-sm text-gray-500 mt-1">Đã thuộc</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <div className="text-3xl font-bold text-purple-600">—</div>
          <div className="text-sm text-gray-500 mt-1">Đang học</div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-lg shadow text-center">
        <p className="text-gray-500 mb-4">Chưa có sổ nào. Hãy tạo sổ để bắt đầu.</p>
        <button
          onClick={() => navigate('/notebooks')}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Quản lý sổ tay
        </button>
      </div>
    </div>
  );
}
